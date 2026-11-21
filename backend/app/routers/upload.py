from fastapi import APIRouter, UploadFile, Depends, File, HTTPException, status
from llama_index.embeddings.ollama import OllamaEmbedding

from app.dependencies import DatabasePool, get_db_pool, get_embed_model, get_storage_service
from app.security import get_current_user_id
from app.schemas.upload import UploadResponse
from app.services import document_repository
from app.services.file_validation import InvalidFileError, validate_document
from app.services.ingestion_service import DuplicateDocumentError, IngestionService
from app.services.storage_service import MinioStorageService

router = APIRouter(prefix="/upload", tags=["Upload"])


def _duplicate(filename: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"A document named '{filename}' already exists. Delete it first or rename the file.",
    )


@router.post(
    "",
    response_model=UploadResponse,
    responses={
        401: {"description": "Not logged in"},
        409: {"description": "You already have a document with the same file name"},
        415: {"description": "Not a valid PDF/DOCX: wrong extension, content does not match it, or corrupted"},
    },
)
async def handle_upload(
        file: UploadFile = File(...),
        user_id: int = Depends(get_current_user_id),
        db_pool: DatabasePool = Depends(get_db_pool),
        embed_model: OllamaEmbedding = Depends(get_embed_model),
        storage_service: MinioStorageService = Depends(get_storage_service),
):
    filename = (file.filename or "").strip()
    file_bytes = await file.read()

    # Check the real content (magic bytes + the file actually opens) before anything is stored
    try:
        mime_type = validate_document(filename, file_bytes)
    except InvalidFileError as e:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=e.to_detail())

    # Names are unique per user. Checked up front to skip parsing/embedding a file that would be refused;
    # the UNIQUE (user_id, filename) constraint still catches two uploads racing each other.
    try:
        exists = document_repository.filename_exists(db_pool, user_id, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error while checking for an existing document: {str(e)}")
    if exists:
        raise _duplicate(filename)

    try:
        result = IngestionService(db_pool, embed_model).ingest(
            user_id=user_id,
            filename=filename,
            file_bytes=file_bytes,
            mime_type=mime_type,
            storage=storage_service,
        )
    except DuplicateDocumentError:
        raise _duplicate(filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error while storing and indexing the document: {str(e)}")

    return UploadResponse(
        document_id=result.document_id,
        filename=filename,
        minio_bucket=storage_service.bucket_name,
        chunks_indexed=result.chunks_count,
        status="completed",
        message=f"{filename} has been successfully processed and {result.chunks_count} chunks were created.",
    )
