import threading
from collections import OrderedDict
from typing import List, Optional

from llama_index.core.base.base_retriever import BaseRetriever
from llama_index.core.chat_engine import CondensePlusContextChatEngine
from llama_index.core.chat_engine.condense_plus_context import DEFAULT_CONDENSE_PROMPT_TEMPLATE
from llama_index.core.base.llms.generic_utils import messages_to_history_str
from llama_index.core.llms import LLM, ChatMessage
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core.schema import NodeWithScore, QueryBundle, TextNode

from app.schemas.query import ChunkSource
from app.services.retriever import VectorRetrieverService

SYSTEM_PROMPT = (
    "You are a precise assistant. Answer the user's question SOLELY based on the provided context. "
    "If the answer is not contained in the context, state that the information is missing. "
    "Answer in the language of the user's question."
)

CONTEXT_PROMPT = """Here are the relevant excerpts from the user's documents:

{context_str}

Instruction: Using only the excerpts above and the conversation so far, answer the user's latest question."""


class PgVectorRetriever(BaseRetriever):
    """Adapts VectorRetrieverService (pgvector search) to the LlamaIndex retriever interface."""

    def __init__(self, service: VectorRetrieverService, top_k: int = 3, file_name: Optional[str] = None):
        super().__init__()
        self._service = service
        self._top_k = top_k
        self._file_name = file_name

    def _retrieve(self, query_bundle: QueryBundle) -> List[NodeWithScore]:
        sources = self._service.search(query_bundle.query_str, top_k=self._top_k, file_name=self._file_name)
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


class ChatSessionStore:
    """In-memory conversation memories keyed by session id (lost on restart, LRU-capped)."""

    def __init__(self, max_sessions: int = 200, token_limit: int = 3000):
        self._memories: "OrderedDict[str, ChatMemoryBuffer]" = OrderedDict()
        self._max_sessions = max_sessions
        self._token_limit = token_limit
        self._lock = threading.Lock()

    def get(self, session_id: str) -> ChatMemoryBuffer:
        with self._lock:
            memory = self._memories.get(session_id)
            if memory is None:
                memory = ChatMemoryBuffer.from_defaults(token_limit=self._token_limit)
                self._memories[session_id] = memory
                if len(self._memories) > self._max_sessions:
                    self._memories.popitem(last=False)
            else:
                self._memories.move_to_end(session_id)
            return memory

    def reset(self, session_id: str) -> None:
        with self._lock:
            self._memories.pop(session_id, None)


class RAGChatEngine(CondensePlusContextChatEngine):
    """
    CondensePlusContextChatEngine that can rewrite follow-up questions with a separate LLM.

    Rewriting a follow-up into a standalone question is a small task; running it on a
    reasoning ("thinking") model makes it take tens of seconds and can hit the request timeout.
    """

    condense_llm: Optional[LLM] = None

    def _condense_question(self, chat_history: List[ChatMessage], latest_message: str) -> str:
        if self.condense_llm is None or self._skip_condense or not chat_history:
            return super()._condense_question(chat_history, latest_message)
        prompt = DEFAULT_CONDENSE_PROMPT_TEMPLATE.format(
            chat_history=messages_to_history_str(chat_history),
            question=latest_message,
        )
        return self.condense_llm.complete(prompt).text.strip() or latest_message


def build_chat_engine(
    retriever: BaseRetriever,
    llm: LLM,
    memory: ChatMemoryBuffer,
    condense_llm: Optional[LLM] = None,
) -> RAGChatEngine:
    engine = RAGChatEngine.from_defaults(
        retriever=retriever,
        llm=llm,
        memory=memory,
        system_prompt=SYSTEM_PROMPT,
        context_prompt=CONTEXT_PROMPT,
    )
    engine.condense_llm = condense_llm
    return engine
