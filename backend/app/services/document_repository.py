"""
Access to the `documents` table. Every function takes the owner's user_id and only ever
sees that user's rows, so one user's documents can't be listed, read or deleted by another.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from app.dependencies import DatabasePool


@dataclass
class DocumentRecord:
    id: int
    user_id: int
    filename: str
    storage_key: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    chunks_count: int = 0


_COLUMNS = "d.id, d.user_id, d.filename, d.storage_key, d.mime_type, d.size_bytes, d.created_at"


def filename_exists(db_pool: DatabasePool, user_id: int, filename: str) -> bool:
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM documents WHERE user_id = %s AND filename = %s", (user_id, filename))
            return cur.fetchone() is not None
    finally:
        db_pool.release_connection(conn)


def list_for_user(db_pool: DatabasePool, user_id: int) -> List[DocumentRecord]:
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_COLUMNS}, COUNT(c.id) AS chunks_count
                FROM documents d
                LEFT JOIN document_chunks c ON c.document_id = d.id
                WHERE d.user_id = %s
                GROUP BY d.id
                ORDER BY d.filename
                """,
                (user_id,),
            )
            return [DocumentRecord(*row) for row in cur.fetchall()]
    finally:
        db_pool.release_connection(conn)


def delete_for_user(db_pool: DatabasePool, user_id: int, document_id: int) -> Optional[DocumentRecord]:
    """
    Deletes the document and (via ON DELETE CASCADE) its chunks.
    Returns the deleted record with the number of removed chunks, or None if this user has no such document.
    """
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_COLUMNS}, (SELECT COUNT(*) FROM document_chunks c WHERE c.document_id = d.id)
                FROM documents d
                WHERE d.id = %s AND d.user_id = %s
                FOR UPDATE
                """,
                (document_id, user_id),
            )
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                return None
            cur.execute("DELETE FROM documents WHERE id = %s AND user_id = %s", (document_id, user_id))
        conn.commit()
        return DocumentRecord(*row)
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.release_connection(conn)
