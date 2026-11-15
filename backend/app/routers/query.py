import json
import logging
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama

from app.dependencies import DatabasePool, get_db_pool, get_embed_model, get_llm_client
from app.schemas.query import QueryRequest, QueryResponse
from app.services.chat_service import (
    ChatSessionStore,
    PgVectorRetriever,
    build_chat_engine,
    node_to_source,
)
from app.services.retriever import VectorRetrieverService

logger = logging.getLogger("rag.query")

router = APIRouter(prefix="/query", tags=["Query"])


def get_session_store(request: Request) -> ChatSessionStore:
    return request.app.state.chat_sessions


def get_condense_llm(request: Request) -> Ollama:
    return request.app.state.condense_llm


def _make_engine(request: QueryRequest, db_pool, embed_model, llm, condense_llm, sessions: ChatSessionStore):
    retriever = PgVectorRetriever(
        VectorRetrieverService(db_pool, embed_model),
        top_k=request.top_k,
        file_name=request.file_name,
    )
    return build_chat_engine(retriever, llm, sessions.get(request.session_id), condense_llm=condense_llm)


def _ndjson(event: dict) -> str:
    return json.dumps(event, ensure_ascii=False) + "\n"


@router.post("", response_model=QueryResponse)
def handle_query(
        request: QueryRequest,
        db_pool: DatabasePool = Depends(get_db_pool),
        embed_model: OllamaEmbedding = Depends(get_embed_model),
        llm: Ollama = Depends(get_llm_client),
        condense_llm: Ollama = Depends(get_condense_llm),
        sessions: ChatSessionStore = Depends(get_session_store),
):
    """Non-streaming variant: returns the whole answer at once."""
    try:
        engine = _make_engine(request, db_pool, embed_model, llm, condense_llm, sessions)
        response = engine.chat(request.question)
        sources = [node_to_source(n) for n in response.source_nodes]
        return QueryResponse(question=request.question, answer=response.response, sources=sources)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error while processing the question: {str(e)}")


@router.post("/stream")
def handle_query_stream(
        request: QueryRequest,
        db_pool: DatabasePool = Depends(get_db_pool),
        embed_model: OllamaEmbedding = Depends(get_embed_model),
        llm: Ollama = Depends(get_llm_client),
        condense_llm: Ollama = Depends(get_condense_llm),
        sessions: ChatSessionStore = Depends(get_session_store),
):
    """
    Streams the answer as NDJSON, one JSON object per line:
      {"type": "sources", "sources": [...]}   once, before generation
      {"type": "token", "content": "..."}      for each generated token
      {"type": "done"}                         at the end
      {"type": "error", "detail": "..."}       if generation fails mid-stream
    """
    # Retrieval and prompt setup run here, so failures still return a proper HTTP error.
    try:
        engine = _make_engine(request, db_pool, embed_model, llm, condense_llm, sessions)
        response: StreamingAgentChatResponse = engine.stream_chat(request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error while processing the question: {str(e)}")

    def event_stream() -> Iterator[str]:
        sources = [node_to_source(n).model_dump() for n in response.source_nodes]
        yield _ndjson({"type": "sources", "sources": sources})
        try:
            for token in response.response_gen:
                if token:
                    yield _ndjson({"type": "token", "content": token})
            yield _ndjson({"type": "done"})
        except Exception as e:
            logger.exception("Streaming generation failed")
            yield _ndjson({"type": "error", "detail": f"Error while generating the answer: {str(e)}"})

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/sessions/{session_id}", status_code=204)
def reset_session(session_id: str, sessions: ChatSessionStore = Depends(get_session_store)):
    """Forget the conversation history of a chat session."""
    sessions.reset(session_id)
