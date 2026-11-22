import threading
from typing import Generator, List, Optional, Sequence

from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.core.base.response.schema import StreamingResponse
from llama_index.core.chat_engine import CondensePlusContextChatEngine
from llama_index.core.chat_engine.condense_plus_context import DEFAULT_CONDENSE_PROMPT_TEMPLATE
from llama_index.core.base.llms.generic_utils import messages_to_history_str
from llama_index.core.llms import LLM, ChatMessage, MessageRole
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core.schema import NodeWithScore, QueryBundle, TextNode

from app.schemas.query import ChunkSource
from app.services.retriever import VectorRetrieverService

SYSTEM_PROMPT = (
    "You are a precise assistant. Answer the user's question SOLELY based on the provided context. "
    "If the answer is not contained in the context, state that the information is missing. "
    "Answer in the language of the user's question."
)

CONTEXT_PROMPT = """Here are the relevant excerpts from the documents the user selected for this search:

{context_str}

Instruction: Answer the user's latest question using ONLY facts stated in the excerpts above.
Use the earlier conversation only to understand what the question refers to, never as a source of facts.
If the excerpts do not contain the answer, say that the answer is not present in the selected documents,
even if it was discussed earlier in the conversation."""

# Key in ChatMessage.additional_kwargs that records which documents a turn was answered from
SCOPE_KEY = "rag_scope"


def scope_of(document_ids: Optional[Sequence[int]]) -> Optional[List[int]]:
    """Canonical scope: None = all documents, otherwise a sorted list of document ids."""
    return sorted(set(document_ids)) if document_ids else None


def scope_covers(current: Optional[List[int]], earlier: Optional[List[int]]) -> bool:
    """True if everything an earlier turn could see is still searchable in the current scope."""
    if current is None:
        return True
    if earlier is None:
        return False
    return set(earlier) <= set(current)


def filter_history_by_scope(history: List[ChatMessage], scope: Optional[List[int]]) -> List[ChatMessage]:
    """
    Drops question/answer turns that were answered from documents outside the current scope,
    so the LLM can't repeat facts from a document the user has since deselected.
    Messages without a recorded scope (older sessions) are treated as "all documents".
    """
    kept: List[ChatMessage] = []
    for msg in history:
        if msg.role == MessageRole.ASSISTANT and not scope_covers(scope, msg.additional_kwargs.get(SCOPE_KEY)):
            if kept and kept[-1].role == MessageRole.USER:
                kept.pop()  # drop the question that belongs to this answer as well
            continue
        kept.append(msg)
    return kept


class PgVectorRetriever(BaseRetriever):
    """Adapts VectorRetrieverService (pgvector search) to the LlamaIndex retriever interface."""

    def __init__(
        self,
        service: VectorRetrieverService,
        user_id: int,
        top_k: int = 3,
        document_ids: Optional[List[int]] = None,
    ):
        super().__init__()
        self._service = service
        self._user_id = user_id
        self._top_k = top_k
        self._document_ids = document_ids

    def _retrieve(self, query_bundle: QueryBundle) -> List[NodeWithScore]:
        sources = self._service.search(
            query_bundle.query_str,
            user_id=self._user_id,
            top_k=self._top_k,
            document_ids=self._document_ids,
        )
        return [
            NodeWithScore(node=TextNode(text=s.content, metadata=s.metadata), score=s.similarity_score)
            for s in sources
        ]


def node_to_source(node: NodeWithScore) -> ChunkSource:
    meta = node.node.metadata or {}
    return ChunkSource(
        content=node.node.get_content(),
        similarity_score=float(node.score or 0.0),
        file_name=meta.get("file_name"),
        page=meta.get("page"),
        chunk_index=meta.get("chunk_index"),
        section=meta.get("section"),
        metadata=meta,
    )


def cancellable(tokens: Generator[str, None, None], cancel: threading.Event) -> Generator[str, None, None]:
    """
    Stops pulling tokens from the LLM once `cancel` is set, and closes the LLM stream,
    which closes the HTTP connection to Ollama so it stops generating.
    """
    try:
        for token in tokens:
            if cancel.is_set():
                break
            yield token
    finally:
        tokens.close()


class RAGChatEngine(CondensePlusContextChatEngine):
    """
    CondensePlusContextChatEngine that can rewrite follow-up questions with a separate LLM.

    Rewriting a follow-up into a standalone question is a small task; running it on a
    reasoning ("thinking") model makes it take tens of seconds and can hit the request timeout.
    """

    condense_llm: Optional[LLM] = None
    scope: Optional[List[int]] = None
    # Set it to stop a running stream_chat (e.g. the client disconnected)
    cancel_event: Optional[threading.Event] = None

    def _condense_question(self, chat_history: List[ChatMessage], latest_message: str) -> str:
        if self.condense_llm is None or self._skip_condense or not chat_history:
            return super()._condense_question(chat_history, latest_message)
        prompt = DEFAULT_CONDENSE_PROMPT_TEMPLATE.format(
            chat_history=messages_to_history_str(chat_history),
            question=latest_message,
        )
        return self.condense_llm.complete(prompt).text.strip() or latest_message

    def _get_response_synthesizer(self, chat_history: List[ChatMessage], streaming: bool = False):
        # The full history is still used above to rewrite follow-ups into standalone questions;
        # only the answer step is restricted to turns from the current scope.
        synthesizer = super()._get_response_synthesizer(filter_history_by_scope(chat_history, self.scope), streaming)
        if streaming and self.cancel_event is not None:
            # LlamaIndex consumes the LLM stream in its own thread, to the very end, even if nobody reads it.
            # Wrapping the token generator here lets cancel_event stop that thread and the Ollama request.
            cancel = self.cancel_event
            synthesize = synthesizer.synthesize

            def synthesize_cancellable(*args, **kwargs):
                response = synthesize(*args, **kwargs)
                if isinstance(response, StreamingResponse) and response.response_gen is not None:
                    response.response_gen = cancellable(response.response_gen, cancel)
                return response

            synthesizer.synthesize = synthesize_cancellable
        return synthesizer


# Token budget for earlier conversation given to the LLM; older messages are left out
HISTORY_TOKEN_LIMIT = 3000


def build_chat_engine(
    retriever: BaseRetriever,
    llm: LLM,
    history: List[ChatMessage],
    condense_llm: Optional[LLM] = None,
    document_ids: Optional[Sequence[int]] = None,
) -> RAGChatEngine:
    """
    `history` is the user's stored conversation (oldest first), each message tagged with its document scope.
    The engine's memory is built from it for this one request; saving the new turn is up to the caller.
    """
    scope = scope_of(document_ids)
    engine = RAGChatEngine.from_defaults(
        retriever=retriever,
        llm=llm,
        memory=ChatMemoryBuffer.from_defaults(chat_history=history, token_limit=HISTORY_TOKEN_LIMIT),
        system_prompt=SYSTEM_PROMPT,
        context_prompt=CONTEXT_PROMPT,
    )
    engine.condense_llm = condense_llm
    engine.scope = scope
    engine.cancel_event = threading.Event()
    return engine
