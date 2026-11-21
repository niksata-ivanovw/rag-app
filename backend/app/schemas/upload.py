from pydantic import BaseModel

class UploadResponse(BaseModel):
    document_id: int
    filename: str
    minio_bucket: str
    chunks_indexed: int
    status: str
    message: str