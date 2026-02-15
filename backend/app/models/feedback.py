"""Chat feedback model for storing user ratings on AI responses."""
import datetime as dt
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class FeedbackRating(str, Enum):
    THUMBS_UP = "thumbs_up"
    THUMBS_DOWN = "thumbs_down"


class ChatFeedback(SQLModel, table=True):
    """Store feedback on AI chat responses."""
    __tablename__ = "chat_feedback"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    user_message: str  # What the user asked
    ai_response: str  # What the AI responded
    rating: FeedbackRating  # Thumbs up or down
    comment: Optional[str] = None  # Optional feedback text
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    user: "User" = Relationship()


class ChatFeedbackCreate(SQLModel):
    user_message: str
    ai_response: str
    rating: FeedbackRating
    comment: Optional[str] = None


class ChatFeedbackRead(SQLModel):
    id: int
    user_message: str
    ai_response: str
    rating: FeedbackRating
    comment: Optional[str]
    created_at: dt.datetime
