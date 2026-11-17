from fastapi import APIRouter, UploadFile, Depends, File, HTTPException, status
from app.schemas.upload import UploadResponse
from app.dependencies import get_db_pool, get_embed_model, get_storage_service, DatabasePool
from app.services.ingestion_service import IngestionService
from app.services.storage_service import MinioStorageService
from llama_index.embeddings.ollama import OllamaEmbedding

router = APIRouter(prefix="/upload", tags=["Upload"])

@router.post(
    "",
    response_model=UploadResponse,
    responses={409: {"description": "A document with the same file name already exists"}},
)
async def handle_upload(
        file: UploadFile = File(...),
        db_pool: DatabasePool = Depends(get_db_pool),
        embed_model: OllamaEmbedding = Depends(get_embed_model),
        storage_service: MinioStorageService = Depends(get_storage_service)
):
    if not file.filename.lower().endswith((".docx", ".pdf")):
        raise HTTPException(status_code=400, detail="Only .docx and .pdf are supported.")

    # Documents are identified by file name, so uploading the same name again would silently
    # overwrite the stored file and re-index it. Refuse instead; the user can delete the old one first.
    ingestion = IngestionService(db_pool, embed_model)
    try:
        in_storage = storage_service.get_file_stat(file.filename) is not None
        in_index = ingestion.is_indexed(file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error while checking for an existing document: {str(e)}")
    if in_storage or in_index:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A document named '{file.filename}' already exists. Delete it first or rename the file.",
        )

    file_bytes = await file.read()

    try:
        storage_service.upload_file(
            filename=file.filename,
            file_bytes=file_bytes,
            content_type=file.content_type or "application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error with MinIO: {str(e)}")

    try:
        chunks_count = ingestion.ingest_bytes(file.filename, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error with pgvector: {str(e)}")

    return UploadResponse(
        filename=file.filename,
        minio_bucket=storage_service.bucket_name,
        chunks_indexed=chunks_count,
        status="completed",
        message=f"{file.filename} has been successfully processed and {chunks_count} chunks were created."
    )