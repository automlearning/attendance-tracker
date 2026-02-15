"""Password reset token model."""
import datetime as dt
import secrets
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class PasswordResetToken(SQLModel, table=True):
    """Store password reset tokens."""
    __tablename__ = "password_reset_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    token: str = Field(index=True, unique=True)
    expires_at: dt.datetime
    used: bool = Field(default=False)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    user: "User" = Relationship()

    @classmethod
    def generate_token(cls) -> str:
        """Generate a secure random token."""
        return secrets.token_urlsafe(32)

    def is_valid(self) -> bool:
        """Check if token is still valid."""
        return not self.used and dt.datetime.utcnow() < self.expires_at
