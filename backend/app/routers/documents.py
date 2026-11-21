import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from llama_index.embeddings.ollama import OllamaEmbedding

from app.dependencies import DatabasePool, get_db_pool, get_embed_model, get_storage_service
from app.routers.upload import handle_upload
from app.schemas.documents import DocumentDeleteResponse, DocumentItem, DocumentListResponse
from app.schemas.upload import UploadResponse
from app.security import get_current_user_id
from app.services import document_repository
from app.services.storage_service import MinioStorageService

logger = logging.getLogger("rag.documents")

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("", response_model=UploadResponse, summary="Upload new document")
async def upload_document(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
    db_pool: DatabasePool = Depends(get_db_pool),
    embed_model: OllamaEmbedding = Depends(get_embed_model),
    storage_service: MinioStorageService = Depends(get_storage_service),
):
    return await handle_upload(
        file=file,
        user_id=user_id,
        db_pool=db_pool,
        embed_model=embed_model,
        storage_service=storage_service,
    )


@router.get("", response_model=DocumentListResponse, summary="List the current user's documents")
def list_documents(
    user_id: int = Depends(get_current_user_id),
    db_pool: DatabasePool = Depends(get_db_pool),
):
    records = document_repository.list_for_user(db_pool, user_id)
    documents = [
        DocumentItem(
            id=r.id,
            filename=r.filename,
            upload_date=r.created_at,
            chunks_count=r.chunks_count,
            size=r.size_bytes,
            # A document with no chunks has no extractable text (e.g. a scanned PDF)
            status="indexed" if r.chunks_count > 0 else "uploaded_only",
        )
        for r in records
    ]
    return DocumentListResponse(documents=documents, total=len(documents))


@router.delete("/{document_id}", response_model=DocumentDeleteResponse, summary="Delete one of the current user's documents")
def delete_document(
    document_id: int,
    user_id: int = Depends(get_current_user_id),
    db_pool: DatabasePool = Depends(get_db_pool),
    storage_service: MinioStorageService = Depends(get_storage_service),
):
    try:
        record = document_repository.delete_for_user(db_pool, user_id, document_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete the document: {str(e)}")

    # Another user's document gives the same 404 as a missing one, so ids can't be probed
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document {document_id} not found.")

    # The database is the source of truth: the document is gone even if removing the file fails
    deleted_from_minio = storage_service.delete_file(record.storage_key)
    if not deleted_from_minio:
        logger.warning("Document %s deleted, but its MinIO object %s was not removed", document_id, record.storage_key)

    return DocumentDeleteResponse(
        document_id=record.id,
        filename=record.filename,
        deleted_from_minio=deleted_from_minio,
        deleted_chunks_count=record.chunks_count,
        message=f"Document '{record.filename}' successfully removed from storage and vector database.",
    )
