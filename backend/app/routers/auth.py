from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.dependencies import DatabasePool, get_db_pool
from app.schemas.auth import RegisterRequest, TokenResponse, UserResponse
from app.security import get_current_user
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Email is already registered"}},
)
def register(body: RegisterRequest, db_pool: DatabasePool = Depends(get_db_pool)):
    """Creates an account. Log in afterwards with POST /auth/login to get a token."""
    try:
        user = auth_service.create_user(db_pool, body.email, body.password)
    except auth_service.EmailAlreadyRegisteredError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This email is already registered.")
    return UserResponse(id=user.id, email=user.email, created_at=user.created_at)


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={401: {"description": "Wrong email or password"}},
)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db_pool: DatabasePool = Depends(get_db_pool),
):
    """
    OAuth2 password flow, as in the FastAPI tutorial: form fields `username` (the email) and `password`,
    sent as application/x-www-form-urlencoded. This is also what the "Authorize" button in /docs uses.
    """
    user = auth_service.authenticate(db_pool, form.username, form.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(
        access_token=auth_service.create_access_token(user.id),
        expires_in=auth_service.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
def me(user: auth_service.User = Depends(get_current_user)):
    """The logged-in user; the frontend can use it to check whether a saved token is still valid."""
    return UserResponse(id=user.id, email=user.email, created_at=user.created_at)
