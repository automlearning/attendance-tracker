import datetime as dt
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class PeriodType(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class TargetBase(SQLModel):
    period_type: PeriodType
    period_start: dt.date
    period_end: dt.date
    office_percentage: float = Field(ge=0, le=100)


class Target(TargetBase, table=True):
    __tablename__ = "targets"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    is_active: bool = Field(default=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    user: "User" = Relationship(back_populates="targets")


class TargetCreate(SQLModel):
    period_type: PeriodType
    period_start: dt.date
    period_end: dt.date
    office_percentage: float = Field(ge=0, le=100)


class TargetRead(TargetBase):
    id: int
    user_id: int
    is_active: bool
    created_at: dt.datetime


class TargetUpdate(SQLModel):
    period_type: Optional[PeriodType] = None
    period_start: Optional[dt.date] = None
    period_end: Optional[dt.date] = None
    office_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    is_active: Optional[bool] = None


class TargetProgress(SQLModel):
    target: TargetRead
    current_percentage: float
    days_in_office: int
    total_workdays: int
    days_remaining: int
    days_needed_to_meet_target: int
    on_track: bool
