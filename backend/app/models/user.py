from datetime import datetime
from enum import Enum
from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.attendance import AttendanceLog
    from app.models.target import Target
    from app.models.subscription import Subscription


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: str
    role: UserRole = Field(default=UserRole.USER)
    is_active: bool = Field(default=True)


class User(UserBase, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    attendance_logs: List["AttendanceLog"] = Relationship(back_populates="user")
    targets: List["Target"] = Relationship(back_populates="user")
    subscription: Optional["Subscription"] = Relationship(back_populates="user")


class UserCreate(SQLModel):
    email: str
    password: str
    full_name: str
    role: UserRole = UserRole.USER


class UserRead(UserBase):
    id: int
    created_at: datetime


class UserUpdate(SQLModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None
