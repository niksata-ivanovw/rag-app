import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from llama_index.embeddings.ollama import OllamaEmbedding
from app.dependencies import get_db_pool, get_storage_service, get_embed_model, DatabasePool
from app.services.storage_service import MinioStorageService
from app.schemas.documents import DocumentItem, DocumentListResponse, DocumentDeleteResponse
from app.schemas.upload import UploadResponse
from app.routers.upload import handle_upload

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("", response_model=UploadResponse, summary="Upload new document")
async def upload_document(
    file: UploadFile = File(...),
    db_pool: DatabasePool = Depends(get_db_pool),
    embed_model: OllamaEmbedding = Depends(get_embed_model),
    storage_service: MinioStorageService = Depends(get_storage_service),
):
    return await handle_upload(
        file=file,
        db_pool=db_pool,
        embed_model=embed_model,
        storage_service=storage_service
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(
    db_pool: DatabasePool = Depends(get_db_pool),
    storage_service: MinioStorageService = Depends(get_storage_service),
):
    db_chunks = {}
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    metadata->>'file_name' AS file_name,
                    COUNT(*) AS chunks_count
                FROM document_chunks
                WHERE metadata->>'file_name' IS NOT NULL
                GROUP BY metadata->>'file_name'
            """)
            for row in cur.fetchall():
                f_name, count = row[0], row[1]
                if f_name:
                    db_chunks[f_name] = count
    finally:
        db_pool.release_connection(conn)

    minio_files = {}
    try:
        for obj in storage_service.list_files():
            minio_files[obj.object_name] = {
                "size": obj.size or 0,
                "upload_date": obj.last_modified,
            }
    except Exception as e:
        print(f"Warning fetching files from MinIO: {e}")

    all_filenames = sorted(set(minio_files.keys()) | set(db_chunks.keys()))
    documents = []

    for fname in all_filenames:
        chunks_count = db_chunks.get(fname, 0)
        minio_info = minio_files.get(fname)

        size = minio_info["size"] if minio_info else 0
        upload_date = minio_info["upload_date"] if minio_info else None

        if minio_info and chunks_count > 0:
            doc_status = "indexed"
        elif minio_info and chunks_count == 0:
            doc_status = "uploaded_only"
        else:
            doc_status = "indexed_no_file"

        documents.append(
            DocumentItem(
                id=fname,
                filename=fname,
                upload_date=upload_date,
                chunks_count=chunks_count,
                size=size,
                status=doc_status,
            )
        )

    return DocumentListResponse(documents=documents, total=len(documents))


@router.delete("/{document_id:path}", response_model=DocumentDeleteResponse)
def delete_document(
    document_id: str,
    db_pool: DatabasePool = Depends(get_db_pool),
    storage_service: MinioStorageService = Depends(get_storage_service),
):
    resolved_id = urllib.parse.unquote(document_id).strip()

    conn = db_pool.get_connection()
    deleted_chunks = 0
    filename = resolved_id

    try:
        with conn.cursor() as cur:
            if resolved_id.isdigit():
                cur.execute(
                    "SELECT DISTINCT metadata->>'file_name' FROM document_chunks WHERE document_id = %s LIMIT 1",
                    (int(resolved_id),)
                )
                row = cur.fetchone()
                if row and row[0]:
                    filename = row[0]

            if resolved_id.isdigit() and filename == resolved_id:
                cur.execute(
                    "DELETE FROM document_chunks WHERE document_id = %s",
                    (int(resolved_id),)
                )
            else:
                cur.execute(
                    "DELETE FROM document_chunks WHERE metadata->>'file_name' = %s",
                    (filename,)
                )
            deleted_chunks = cur.rowcount
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete chunks from pgvector: {str(e)}"
        )
    finally:
        db_pool.release_connection(conn)

    minio_stat = storage_service.get_file_stat(filename)
    deleted_minio = False
    if minio_stat:
        deleted_minio = storage_service.delete_file(filename)
    else:
        if resolved_id != filename and storage_service.get_file_stat(resolved_id):
            deleted_minio = storage_service.delete_file(resolved_id)
            filename = resolved_id

    if not minio_stat and deleted_chunks == 0 and not deleted_minio:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{resolved_id}' not found in MinIO or database."
        )

    return DocumentDeleteResponse(
        document_id=resolved_id,
        filename=filename,
        deleted_from_minio=deleted_minio,
        deleted_chunks_count=deleted_chunks,
        message=f"Document '{filename}' successfully removed from storage and vector database."
    )
