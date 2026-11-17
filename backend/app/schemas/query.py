from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Any, Dict

class ChunkSource(BaseModel):
    content: str
    similarity_score: float
    file_name: Optional[str] = None
    page: Optional[int] = None
    chunk_index: Optional[int] = None
    section: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=2, example="Колко точки получава човекът на позиция 4?")
    top_k: int = Field(default=3, ge=1, le=10, description="Брой Резултати от търсенето")
    document_ids: Optional[List[str]] = Field(
        default=None,
        max_length=200,
        description="ID-та на документи (от GET /documents), в които да се търси. Празен списък или null = всички документи.",
    )
    session_id: str = Field(default="default", min_length=1, max_length=128, description="ID на чат сесията; историята на разговора се пази по него")

    @field_validator("document_ids")
    @classmethod
    def _normalize_document_ids(cls, ids: Optional[List[str]]) -> Optional[List[str]]:
        if ids is None:
            return None
        # strip, drop empty values and duplicates while keeping order
        return list(dict.fromkeys(i.strip() for i in ids if i and i.strip()))

class QueryResponse(BaseModel):
    question: str
    answer: str
    sources: List[ChunkSource]