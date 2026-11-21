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
        user_id: int,
        top_k: int = 3,
        document_ids: Optional[List[int]] = None,
    ) -> List[ChunkSource]:
        """
        Vector search over the chunks of `user_id`'s documents only.
        document_ids narrows it to some of those documents; None or [] searches all of them.
        Ids of documents that belong to someone else simply match nothing.
        """
        # generate vector using bge-m3
        query_vector = self.embed_model.get_text_embedding(query_text)
        ids = list(document_ids) if document_ids else None

        conn = self.db_pool.get_connection()
        try:
            register_vector(conn)
            with conn.cursor() as cur:
                # MATERIALIZED makes this an exact search over the user's chunks. Through the HNSW index,
                # Postgres would take the ~40 nearest chunks of ALL users and filter afterwards
                # (pgvector < 0.8 has no iterative scans), so a user with a small share of the data
                # would get fewer than top_k results, or none.
                cur.execute(
                    """
                    WITH candidates AS MATERIALIZED (
                        SELECT c.content, c.metadata, c.embedding
                        FROM document_chunks c
                        JOIN documents d ON d.id = c.document_id
                        WHERE d.user_id = %(user_id)s
                          AND (%(ids)s::bigint[] IS NULL OR d.id = ANY(%(ids)s::bigint[]))
                    )
                    SELECT content, 1 - (embedding <=> %(vec)s::vector) AS similarity_score, metadata
                    FROM candidates
                    ORDER BY embedding <=> %(vec)s::vector
                    LIMIT %(top_k)s;
                    """,
                    {"user_id": user_id, "ids": ids, "vec": query_vector, "top_k": top_k},
                )
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