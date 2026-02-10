import datetime as dt
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint

if TYPE_CHECKING:
    from app.models.user import User


class AttendanceStatus(str, Enum):
    IN_OFFICE = "in_office"
    WFH = "wfh"
    ANNUAL_LEAVE = "annual_leave"
    SICK_LEAVE = "sick_leave"
    HOLIDAY = "holiday"


class AttendanceSource(str, Enum):
    MANUAL = "manual"
    CALENDAR_SYNC = "calendar_sync"
    AI_NLP = "ai_nlp"


class AttendanceLogBase(SQLModel):
    date: dt.date = Field(index=True)
    status: AttendanceStatus
    source: AttendanceSource = Field(default=AttendanceSource.MANUAL)
    notes: Optional[str] = None


class AttendanceLog(AttendanceLogBase, table=True):
    __tablename__ = "attendance_logs"
    __table_args__ = (UniqueConstraint("user_id", "date", name="unique_user_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    user: "User" = Relationship(back_populates="attendance_logs")


class AttendanceLogCreate(SQLModel):
    date: dt.date
    status: AttendanceStatus
    source: AttendanceSource = AttendanceSource.MANUAL
    notes: Optional[str] = None


class AttendanceLogRead(AttendanceLogBase):
    id: int
    user_id: int
    created_at: dt.datetime


class AttendanceLogUpdate(SQLModel):
    status: Optional[AttendanceStatus] = None
    notes: Optional[str] = None


class AttendanceSummary(SQLModel):
    period_start: dt.date
    period_end: dt.date
    total_workdays: int
    in_office_days: int
    wfh_days: int
    annual_leave_days: int
    sick_leave_days: int
    attendance_percentage: float  # (workdays - annual leave - sick days) / workdays
    office_percentage: float  # in_office / (in_office + wfh)
