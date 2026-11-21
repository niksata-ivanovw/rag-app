"""
Dependency for protected endpoints: reads the JWT from "Authorization: Bearer <token>"
and injects the id of the logged-in user. Any problem with the token gives the same 401.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.dependencies import DatabasePool, get_db_pool
from app.services import auth_service

# tokenUrl only tells the Swagger UI (/docs) where to log in ("Authorize" button)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db_pool: DatabasePool = Depends(get_db_pool),
) -> auth_service.User:
    try:
        user_id = auth_service.decode_access_token(token)
    except auth_service.InvalidTokenError:
        raise _unauthorized("Invalid or expired token")

    # The account may have been deleted after the token was issued
    user = auth_service.get_user(db_pool, user_id)
    if user is None:
        raise _unauthorized("Invalid or expired token")
    return user


def get_current_user_id(user: auth_service.User = Depends(get_current_user)) -> int:
    return user.id
