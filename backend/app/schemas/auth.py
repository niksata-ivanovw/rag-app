from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_BYTES = 72  # bcrypt ignores everything after 72 bytes


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254, examples=["user@example.com"])
    password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, examples=["a-long-passphrase"])

    @field_validator("password")
    @classmethod
    def _fits_bcrypt(cls, password: str) -> str:
        if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
            # Cyrillic letters take 2 bytes each in UTF-8, so the limit is ~36 of them
            raise ValueError(f"Password is too long (max {MAX_PASSWORD_BYTES} bytes in UTF-8).")
        return password


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Seconds until the token expires")
