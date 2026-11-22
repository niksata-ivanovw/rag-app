-- 0001: schema as it existed before migrations were tracked (document_chunks only).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    id          BIGSERIAL PRIMARY KEY,
    document_id INTEGER,
    content     TEXT NOT NULL,
    metadata    JSONB,
    embedding   vector(1024)          -- bge-m3
);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
    ON document_chunks USING hnsw (embedding vector_cosine_ops);
