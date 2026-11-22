-- 0003: persistent chat history, one conversation per user account.
--
-- Replaces the in-process memory that was lost on every restart. The UI renders this history,
-- and the chat engine loads the latest messages from it before answering.

CREATE TABLE chat_messages (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content      TEXT NOT NULL DEFAULT '',
    -- documents the question was limited to (documents.id); NULL = all of the user's documents.
    -- Not a foreign key on purpose: the history must survive deleting a document.
    scope        BIGINT[],
    -- file names of that scope at the time of the question, for the label in the UI
    target_files TEXT[] NOT NULL DEFAULT '{}',
    -- retrieved chunks shown under an answer
    sources      JSONB NOT NULL DEFAULT '[]',
    -- generating: answer still streaming | complete | stopped: user pressed Stop | error
    status       TEXT NOT NULL DEFAULT 'complete'
                 CHECK (status IN ('generating', 'complete', 'stopped', 'error')),
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_user_id_idx ON chat_messages (user_id, id);

-- At most one answer per user can be generating at a time. A second question sent meanwhile
-- (e.g. from another tab) violates this index and is refused with 409, instead of both
-- answers being written into the same conversation interleaved.
CREATE UNIQUE INDEX chat_messages_one_generating_per_user
    ON chat_messages (user_id) WHERE status = 'generating';
