import json
import logging
from typing import AsyncIterator, List, Optional

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama

from app.dependencies import DatabasePool, get_db_pool, get_embed_model, get_llm_client
from app.schemas.query import ChatHistoryMessage, ChatHistoryResponse, QueryRequest, QueryResponse
from app.security import get_current_user_id
from app.services import chat_history
from app.services.chat_service import PgVectorRetriever, build_chat_engine, node_to_source
from app.services.retriever import VectorRetrieverService

logger = logging.getLogger("rag.query")

router = APIRouter(prefix="/query", tags=["Query"])

BUSY_RESPONSE = {409: {"description": "An answer for this account is still being generated (e.g. in another tab)"}}


def get_condense_llm(request: Request) -> Ollama:
    return request.app.state.condense_llm


def _start_turn(request: QueryRequest, user_id: int, db_pool: DatabasePool) -> chat_history.Turn:
    """Saves the question and reserves the answer; the chat session is the account from the JWT."""
    try:
        return chat_history.start_turn(
            db_pool, user_id, request.question, request.document_ids, regenerate=request.regenerate
        )
    except chat_history.ChatBusyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another answer is still being generated for this account. Wait for it to finish or stop it.",
        )


def _make_engine(request: QueryRequest, user_id: int, turn: chat_history.Turn, db_pool, embed_model, llm, condense_llm):
    retriever = PgVectorRetriever(
        VectorRetrieverService(db_pool, embed_model),
        user_id=user_id,
        top_k=request.top_k,
        document_ids=request.document_ids,
    )
    return build_chat_engine(
        retriever,
        llm,
        turn.history,
        condense_llm=condense_llm,
        document_ids=request.document_ids,
    )


def _finish(db_pool: DatabasePool, turn: chat_history.Turn, content: str, state: str,
            sources: Optional[List[dict]] = None, error: Optional[str] = None) -> None:
    try:
        chat_history.finish_turn(db_pool, turn.assistant_message_id, content, state, sources, error)
    except Exception:
        # The answer was already delivered; a failed save must not turn it into an error
        logger.exception("Could not save the answer %s", turn.assistant_message_id)


def _ndjson(event: dict) -> str:
    return json.dumps(event, ensure_ascii=False) + "\n"


@router.post("", response_model=QueryResponse, responses=BUSY_RESPONSE)
def handle_query(
        request: QueryRequest,
        user_id: int = Depends(get_current_user_id),
        db_pool: DatabasePool = Depends(get_db_pool),
        embed_model: OllamaEmbedding = Depends(get_embed_model),
        llm: Ollama = Depends(get_llm_client),
        condense_llm: Ollama = Depends(get_condense_llm),
):
    """Non-streaming variant: returns the whole answer at once."""
    turn = _start_turn(request, user_id, db_pool)
    try:
        engine = _make_engine(request, user_id, turn, db_pool, embed_model, llm, condense_llm)
        response = engine.chat(request.question)
        sources = [node_to_source(n) for n in response.source_nodes]
    except Exception as e:
        _finish(db_pool, turn, "", "error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error while processing the question: {str(e)}")
    _finish(db_pool, turn, response.response, "complete", [s.model_dump() for s in sources])
    return QueryResponse(question=request.question, answer=response.response, sources=sources)


@router.post("/stream", responses=BUSY_RESPONSE)
def handle_query_stream(
        request: QueryRequest,
        http_request: Request,
        user_id: int = Depends(get_current_user_id),
        db_pool: DatabasePool = Depends(get_db_pool),
        embed_model: OllamaEmbedding = Depends(get_embed_model),
        llm: Ollama = Depends(get_llm_client),
        condense_llm: Ollama = Depends(get_condense_llm),
):
    """
    Streams the answer as NDJSON, one JSON object per line:
      {"type": "sources", "sources": [...]}   once, before generation
      {"type": "token", "content": "..."}      for each generated token
      {"type": "done"}                         at the end
      {"type": "error", "detail": "..."}       if generation fails mid-stream

    The question and the answer are saved in the account's chat history. If the client disconnects
    (e.g. the user pressed "Stop"), generation is cancelled and the part sent so far is saved as 'stopped'.
    """
    turn = _start_turn(request, user_id, db_pool)

    # Retrieval and prompt setup run here, so failures still return a proper HTTP error.
    try:
        engine = _make_engine(request, user_id, turn, db_pool, embed_model, llm, condense_llm)
        response: StreamingAgentChatResponse = engine.stream_chat(request.question)
    except Exception as e:
        _finish(db_pool, turn, "", "error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error while processing the question: {str(e)}")

    async def event_stream() -> AsyncIterator[str]:
        tokens = response.response_gen  # blocking generator, so each next() runs in the threadpool
        sent: List[str] = []
        sources: List[dict] = []
        state, error = "stopped", None  # stays 'stopped' unless the answer completes or fails
        try:
            sources = [node_to_source(n).model_dump() for n in response.source_nodes]
            yield _ndjson({"type": "sources", "sources": sources})
            while True:
                # Starlette only notices a disconnect when a write fails; check explicitly instead
                if await http_request.is_disconnected():
                    logger.info("Client disconnected, stopping generation (user %s)", user_id)
                    return
                token = await run_in_threadpool(next, tokens, None)
                if token is None:
                    break
                if token:
                    sent.append(token)
                    yield _ndjson({"type": "token", "content": token})
            state = "complete"
            yield _ndjson({"type": "done"})
        except Exception as e:
            logger.exception("Streaming generation failed")
            state, error = "error", f"Error while generating the answer: {str(e)}"
            yield _ndjson({"type": "error", "detail": error})
        finally:
            # Runs on normal end, on disconnect and on cancellation: stops the Ollama stream if still running
            engine.cancel_event.set()
            # Shielded, so the answer is saved (and the account unblocked) even when the request was cancelled
            with anyio.CancelScope(shield=True):
                await run_in_threadpool(_finish, db_pool, turn, "".join(sent), state, sources, error)

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/session", response_model=ChatHistoryResponse)
def get_session(
        user_id: int = Depends(get_current_user_id),
        db_pool: DatabasePool = Depends(get_db_pool),
):
    """The current user's conversation, oldest first; what the chat page shows in every browser."""
    messages = chat_history.get_messages(db_pool, user_id)
    return ChatHistoryResponse(
        messages=[
            ChatHistoryMessage(
                id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at,
                document_ids=m.scope,
                target_files=m.target_files,
                sources=m.sources,
                status=m.status,
                error=m.error,
            )
            for m in messages
        ]
    )


@router.delete("/session", status_code=204)
def reset_session(
        user_id: int = Depends(get_current_user_id),
        db_pool: DatabasePool = Depends(get_db_pool),
):
    """Deletes the current user's conversation (the "clear chat" button); every open browser sees it empty."""
    chat_history.clear(db_pool, user_id)
