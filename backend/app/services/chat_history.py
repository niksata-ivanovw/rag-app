"""
Persistent chat history in the `chat_messages` table: one conversation per user account.

A question is a "turn": start_turn() saves the question plus an empty assistant message in
status 'generating' and returns the earlier history for the chat engine; finish_turn() fills
in the answer when generation ends (complete, stopped by the user, or failed).
"""
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Sequence

import psycopg2.errors
import psycopg2.extras
from llama_index.core.llms import ChatMessage, MessageRole

from app.dependencies import DatabasePool
from app.services.chat_service import SCOPE_KEY, scope_of

# Messages loaded into the engine's memory; ChatMemoryBuffer trims them further by tokens
HISTORY_FOR_ENGINE = 60
# How many messages the UI gets
HISTORY_FOR_UI = 500
# A 'generating' answer older than this was left behind by a crash or restart: it no longer blocks new questions
STALE_GENERATING = "10 minutes"


class ChatBusyError(Exception):
    """Another answer for this user is still being generated (e.g. in another tab)."""


@dataclass
class Turn:
    user_message_id: int
    assistant_message_id: int
    # Earlier conversation for the chat engine, oldest first, with the document scope of each message
    history: List[ChatMessage]


@dataclass
class StoredMessage:
    id: int
    role: str
    content: str
    scope: Optional[List[int]]
    target_files: List[str]
    sources: List[dict]
    status: str
    error: Optional[str]
    created_at: datetime


def start_turn(
    db_pool: DatabasePool,
    user_id: int,
    question: str,
    document_ids: Optional[Sequence[int]],
    regenerate: bool = False,
) -> Turn:
    """
    Raises ChatBusyError if an answer is already being generated for this user.
    With regenerate, the last question (and its answer) is replaced by this new turn.
    """
    scope = scope_of(document_ids)
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            # Answers stuck in 'generating' after a crash would otherwise block the user forever
            cur.execute(
                f"""
                UPDATE chat_messages
                SET status = 'error', error = 'Generation was interrupted.', updated_at = now()
                WHERE user_id = %s AND status = 'generating' AND updated_at < now() - interval '{STALE_GENERATING}'
                """,
                (user_id,),
            )

            if regenerate:
                _delete_last_turn(cur, user_id, question)

            history = _load_engine_history(cur, user_id)

            cur.execute(
                """
                INSERT INTO chat_messages (user_id, role, content, scope, target_files)
                VALUES (
                    %(user_id)s, 'user', %(question)s, %(scope)s::bigint[],
                    COALESCE((SELECT array_agg(filename ORDER BY filename) FROM documents
                              WHERE user_id = %(user_id)s AND id = ANY(%(scope)s::bigint[])), '{}')
                )
                RETURNING id
                """,
                {"user_id": user_id, "question": question, "scope": scope},
            )
            user_message_id = cur.fetchone()[0]
            try:
                cur.execute(
                    """
                    INSERT INTO chat_messages (user_id, role, scope, status)
                    VALUES (%s, 'assistant', %s::bigint[], 'generating')
                    RETURNING id
                    """,
                    (user_id, scope),
                )
            except psycopg2.errors.UniqueViolation as e:
                raise ChatBusyError() from e
            assistant_message_id = cur.fetchone()[0]
        conn.commit()
        return Turn(user_message_id, assistant_message_id, history)
    except Exception:
        conn.rollback()  # also undoes the regenerate delete if the user turned out to be busy
        raise
    finally:
        db_pool.release_connection(conn)


def _delete_last_turn(cur, user_id: int, question: str) -> None:
    """Deletes the last question if it is `question`, together with the answer after it."""
    cur.execute(
        "SELECT id, role, content, status FROM chat_messages WHERE user_id = %s ORDER BY id DESC LIMIT 2",
        (user_id,),
    )
    last = cur.fetchall()  # newest first
    if any(status == "generating" for *_, status in last):
        raise ChatBusyError()
    if len(last) == 2 and last[0][1] == "assistant" and last[1][1] == "user" and last[1][2].strip() == question.strip():
        cur.execute("DELETE FROM chat_messages WHERE id IN (%s, %s)", (last[0][0], last[1][0]))
    elif last and last[0][1] == "user" and last[0][2].strip() == question.strip():
        cur.execute("DELETE FROM chat_messages WHERE id = %s", (last[0][0],))


def _load_engine_history(cur, user_id: int) -> List[ChatMessage]:
    # Failed answers only hold an error text, so they are left out; their questions stay
    cur.execute(
        """
        SELECT role, content, scope FROM (
            SELECT id, role, content, scope FROM chat_messages
            WHERE user_id = %s
              AND (role = 'user' OR (status IN ('complete', 'stopped') AND content <> ''))
            ORDER BY id DESC
            LIMIT %s
        ) recent
        ORDER BY id
        """,
        (user_id, HISTORY_FOR_ENGINE),
    )
    return [
        ChatMessage(
            role=MessageRole.USER if role == "user" else MessageRole.ASSISTANT,
            content=content,
            additional_kwargs={SCOPE_KEY: list(scope) if scope else None},
        )
        for role, content, scope in cur.fetchall()
    ]


def finish_turn(
    db_pool: DatabasePool,
    assistant_message_id: int,
    content: str,
    status: str,
    sources: Optional[List[dict]] = None,
    error: Optional[str] = None,
) -> None:
    """Saves the final answer. Does nothing if the chat was cleared in the meantime."""
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE chat_messages
                SET content = %s, status = %s, sources = %s, error = %s, updated_at = now()
                WHERE id = %s AND status = 'generating'
                """,
                (content, status, psycopg2.extras.Json(sources or []), error, assistant_message_id),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.release_connection(conn)


def get_messages(db_pool: DatabasePool, user_id: int, limit: int = HISTORY_FOR_UI) -> List[StoredMessage]:
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, role, content, scope, target_files, sources, status, error, created_at FROM (
                    SELECT * FROM chat_messages WHERE user_id = %s ORDER BY id DESC LIMIT %s
                ) recent
                ORDER BY id
                """,
                (user_id, limit),
            )
            return [
                StoredMessage(
                    id=r[0], role=r[1], content=r[2], scope=list(r[3]) if r[3] else None,
                    target_files=list(r[4] or []), sources=r[5] or [], status=r[6], error=r[7], created_at=r[8],
                )
                for r in cur.fetchall()
            ]
    finally:
        db_pool.release_connection(conn)


def clear(db_pool: DatabasePool, user_id: int) -> int:
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM chat_messages WHERE user_id = %s", (user_id,))
            deleted = cur.rowcount
        conn.commit()
        return deleted
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.release_connection(conn)
