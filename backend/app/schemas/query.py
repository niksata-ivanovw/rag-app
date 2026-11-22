from datetime import datetime

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
    document_ids: Optional[List[int]] = Field(
        default=None,
        max_length=200,
        description="ID-та на документи (от GET /documents), в които да се търси. Празен списък или null = всички документи.",
    )
    regenerate: bool = Field(
        default=False,
        description="Генерира наново отговора на последния въпрос: предишният ход се маха от историята преди отговора",
    )

    @field_validator("document_ids")
    @classmethod
    def _normalize_document_ids(cls, ids: Optional[List[int]]) -> Optional[List[int]]:
        if ids is None:
            return None
        return list(dict.fromkeys(ids))  # drop duplicates, keep order

class ChatHistoryMessage(BaseModel):
    id: int
    role: str  # user | assistant
    content: str
    created_at: datetime
    document_ids: Optional[List[int]] = Field(default=None, description="Документите, в които е търсено; null = всички")
    target_files: List[str] = Field(default_factory=list, description="Имената им към момента на въпроса")
    sources: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = Field(..., description="generating | complete | stopped | error")
    error: Optional[str] = None


class ChatHistoryResponse(BaseModel):
    messages: List[ChatHistoryMessage]


class QueryResponse(BaseModel):
    question: str
    answer: str
    sources: List[ChunkSource]