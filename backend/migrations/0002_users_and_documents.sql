-- 0002: user accounts, and documents owned by a user.
--
-- Before: document_chunks.document_id was always 1 and a document was identified only by
-- metadata->>'file_name'. Now every uploaded file is a row in `documents`, owned by a user,
-- and each chunk points to its document. Deleting a user deletes their documents and chunks.

TRUNCATE document_chunks RESTART IDENTITY;

CREATE TABLE users (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
    hashed_password TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    filename    TEXT NOT NULL CHECK (filename <> ''),
    -- object key in MinIO; namespaced per user, so two users can upload files with the same name
    storage_key TEXT NOT NULL UNIQUE,
    mime_type   TEXT NOT NULL,
    size_bytes  BIGINT NOT NULL CHECK (size_bytes >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- a user can't have two documents with the same name (upload returns 409);
    -- also serves as the index for "all documents of user X"
    UNIQUE (user_id, filename)
);

ALTER TABLE document_chunks
    ALTER COLUMN document_id TYPE BIGINT,
    ALTER COLUMN document_id SET NOT NULL,
    ADD CONSTRAINT document_chunks_document_id_fkey
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE;

CREATE INDEX document_chunks_document_id_idx ON document_chunks (document_id);
