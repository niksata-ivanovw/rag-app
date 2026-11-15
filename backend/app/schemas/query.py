from pydantic import BaseModel, Field
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
    file_name: Optional[str] = Field(default=None, description="Опционален филтър по име на документ")
    session_id: str = Field(default="default", min_length=1, max_length=128, description="ID на чат сесията; историята на разговора се пази по него")

class QueryResponse(BaseModel):
    question: str
    answer: str
    sources: List[ChunkSource]