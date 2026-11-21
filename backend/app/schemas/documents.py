from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DocumentItem(BaseModel):
    id: int
    filename: str
    upload_date: Optional[datetime] = None
    chunks_count: int
    size: int
    status: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentItem]
    total: int


class DocumentDeleteResponse(BaseModel):
    document_id: int
    filename: str
    deleted_from_minio: bool
    deleted_chunks_count: int
    message: str
