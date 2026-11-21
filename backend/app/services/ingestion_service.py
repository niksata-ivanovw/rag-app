import logging
import os
import tempfile
import uuid
from dataclasses import dataclass
from typing import List, Tuple

import psycopg2.errors
import psycopg2.extras
from llama_index.embeddings.ollama import OllamaEmbedding
from pgvector.psycopg2 import register_vector

from app.dependencies import DatabasePool
from app.services.chunking import chunk_blocks
from app.services.parsers import read_blocks
from app.services.storage_service import MinioStorageService

logger = logging.getLogger("rag.ingestion")


class DuplicateDocumentError(Exception):
    """The user already has a document with this file name."""


@dataclass
class IngestionResult:
    document_id: int
    storage_key: str
    chunks_count: int


def storage_key_for(user_id: int, filename: str) -> str:
    # The random part keeps keys unique even if a name is deleted and uploaded again,
    # so cleaning up after a failed upload can never remove another document's file.
    return f"users/{user_id}/{uuid.uuid4().hex}/{filename}"


class IngestionService:
    def __init__(self, db_pool: DatabasePool, embed_model: OllamaEmbedding):
        self.db_pool = db_pool
        self.embed_model = embed_model

    def _parse_and_embed(self, filename: str, file_bytes: bytes) -> Tuple[list, List[list]]:
        """Parse -> chunk -> embed. No side effects, so a file that fails here leaves nothing behind."""
        suffix = os.path.splitext(filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            blocks = read_blocks(tmp_path)
            chunks = chunk_blocks(
                blocks,
                self.embed_model.get_text_embedding_batch,
                file_name=filename,
                percentile=90,
                min_chars=300,
                max_chars=1200,
            )
            vectors = self.embed_model.get_text_embedding_batch([c.embed_text for c in chunks]) if chunks else []
            return chunks, vectors
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def ingest(
        self,
        user_id: int,
        filename: str,
        file_bytes: bytes,
        mime_type: str,
        storage: MinioStorageService,
    ) -> IngestionResult:
        """
        Stores a new document for `user_id`: the file in MinIO, a `documents` row and its chunks.
        Either all of it is saved or none of it. Raises DuplicateDocumentError if the user
        already has a document with this name.
        """
        chunks, vectors = self._parse_and_embed(filename, file_bytes)
        storage_key = storage_key_for(user_id, filename)

        conn = self.db_pool.get_connection()
        uploaded = False
        try:
            register_vector(conn)
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        """
                        INSERT INTO documents (user_id, filename, storage_key, mime_type, size_bytes)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (user_id, filename, storage_key, mime_type, len(file_bytes)),
                    )
                except psycopg2.errors.UniqueViolation as e:
                    raise DuplicateDocumentError(filename) from e
                document_id = cur.fetchone()[0]

                if chunks:
                    rows = [
                        (document_id, c.content, psycopg2.extras.Json({**c.metadata, "document_id": document_id}), vec)
                        for c, vec in zip(chunks, vectors)
                    ]
                    psycopg2.extras.execute_values(
                        cur,
                        "INSERT INTO document_chunks (document_id, content, metadata, embedding) VALUES %s",
                        rows,
                    )

            # The file goes to MinIO while the rows are still uncommitted, so a MinIO failure
            # rolls back the rows, and a commit failure removes the file below.
            storage.upload_file(filename=storage_key, file_bytes=file_bytes, content_type=mime_type)
            uploaded = True
            conn.commit()
            return IngestionResult(document_id=document_id, storage_key=storage_key, chunks_count=len(chunks))
        except Exception:
            conn.rollback()
            if uploaded and not storage.delete_file(storage_key):
                logger.warning("Could not remove orphaned MinIO object %s", storage_key)
            raise
        finally:
            self.db_pool.release_connection(conn)
