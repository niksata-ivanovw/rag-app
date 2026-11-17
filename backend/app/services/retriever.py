from typing import List, Optional

from llama_index.embeddings.ollama import OllamaEmbedding
from pgvector.psycopg2 import register_vector

from app.dependencies import DatabasePool
from app.schemas.query import ChunkSource


class VectorRetrieverService:
    def __init__(self, db_pool: DatabasePool, embed_model: OllamaEmbedding):
        self.db_pool = db_pool
        self.embed_model = embed_model

    def search(
        self,
        query_text: str,
        top_k: int = 3,
        document_ids: Optional[List[str]] = None,
    ) -> List[ChunkSource]:
        """
        Vector search over document_chunks.

        document_ids are the ids returned by GET /documents (currently the file name),
        so they are matched against metadata->>'file_name'. None or [] searches everything.
        """
        # generate vector using bge-m3
        query_vector = self.embed_model.get_text_embedding(query_text)
        ids = [i.strip() for i in (document_ids or []) if i and i.strip()]

        conn = self.db_pool.get_connection()
        try:
            register_vector(conn)
            with conn.cursor() as cur:
                if ids:
                    # psycopg2 adapts a Python list to a Postgres array, so ANY(%s) matches any of the ids
                    search_query = """
                        SELECT content, 1 - (embedding <=> %s::vector) AS similarity_score, metadata
                        FROM document_chunks
                        WHERE metadata->>'file_name' = ANY(%s::text[])
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s;
                    """
                    cur.execute(search_query, (query_vector, ids, query_vector, top_k))
                else:
                    search_query = """
                        SELECT content, 1 - (embedding <=> %s::vector) AS similarity_score, metadata
                        FROM document_chunks
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s;
                    """
                    cur.execute(search_query, (query_vector, query_vector, top_k))
                rows = cur.fetchall()

                sources = []
                for row in rows:
                    content, score, meta = row[0].strip(), float(row[1]), row[2] or {}
                    sources.append(
                        ChunkSource(
                            content=content,
                            similarity_score=score,
                            file_name=meta.get("file_name"),
                            page=meta.get("page"),
                            chunk_index=meta.get("chunk_index"),
                            section=meta.get("section"),
                            metadata=meta
                        )
                    )

                return sources
        finally:
            self.db_pool.release_connection(conn)