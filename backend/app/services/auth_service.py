"""
Password hashing (bcrypt), JWT access tokens (python-jose) and the users table.

Configuration (environment variables):
  RAG_JWT_SECRET           secret used to sign tokens. If unset, a random one is generated at
                           startup: fine for development, but every restart logs everyone out.
  RAG_JWT_EXPIRE_MINUTES   token lifetime, default 720 (12 hours).
"""
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import psycopg2.errors
from jose import JWTError, jwt

from app.dependencies import DatabasePool

logger = logging.getLogger("rag.auth")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("RAG_JWT_EXPIRE_MINUTES", "720"))

_secret = os.getenv("RAG_JWT_SECRET")
if not _secret:
    _secret = secrets.token_urlsafe(48)
    logger.warning("RAG_JWT_SECRET is not set: using a random secret, so tokens stop working after a restart.")
JWT_SECRET = _secret

BCRYPT_ROUNDS = 12  # passwords over 72 bytes are refused by RegisterRequest; bcrypt would ignore the rest

# Verified against when the email is unknown, so a login takes as long whether or not the account exists
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(BCRYPT_ROUNDS))


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidTokenError(Exception):
    pass


@dataclass
class User:
    id: int
    email: str
    created_at: datetime


def normalize_email(email: str) -> str:
    # Matches the CHECK constraint on users.email
    return email.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
    except ValueError:  # malformed hash, or a password over 72 bytes
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),  # JWT requires "sub" to be a string
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> int:
    """Returns the user id from a valid, unexpired access token; raises InvalidTokenError otherwise."""
    try:
        # algorithms is fixed, so a token can't pick its own (e.g. "none")
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        raise InvalidTokenError(str(e)) from e
    if claims.get("type") != "access":
        raise InvalidTokenError("not an access token")
    try:
        return int(claims["sub"])
    except (KeyError, TypeError, ValueError) as e:
        raise InvalidTokenError("invalid subject") from e


def create_user(db_pool: DatabasePool, email: str, password: str) -> User:
    hashed = hash_password(password)
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO users (email, hashed_password) VALUES (%s, %s) RETURNING id, email, created_at",
                    (normalize_email(email), hashed),
                )
            except psycopg2.errors.UniqueViolation as e:
                raise EmailAlreadyRegisteredError(email) from e
            row = cur.fetchone()
        conn.commit()
        return User(*row)
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.release_connection(conn)


def authenticate(db_pool: DatabasePool, email: str, password: str) -> Optional[User]:
    """The user if email and password match, otherwise None (without telling which one was wrong)."""
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, created_at, hashed_password FROM users WHERE email = %s",
                (normalize_email(email),),
            )
            row = cur.fetchone()
    finally:
        db_pool.release_connection(conn)

    if row is None:
        verify_password(password, _DUMMY_HASH.decode("ascii"))
        return None
    if not verify_password(password, row[3]):
        return None
    return User(*row[:3])


def get_user(db_pool: DatabasePool, user_id: int) -> Optional[User]:
    conn = db_pool.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, created_at FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            return User(*row) if row else None
    finally:
        db_pool.release_connection(conn)
