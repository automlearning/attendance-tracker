import datetime as dt
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint

if TYPE_CHECKING:
    from app.models.user import User


class AttendanceStatus(str, Enum):
    IN_OFFICE = "in_office"
    WFH = "wfh"  # Regular WFH - counts against 50% target
    WFH_EXEMPT = "wfh_exempt"  # Discretionary exemption - doesn't count against target
    ANNUAL_LEAVE = "annual_leave"
    SICK_LEAVE = "sick_leave"
    PUBLIC_HOLIDAY = "public_holiday"
    PLANNED_OFFICE = "planned_office"  # Planning to go to office (future)
    PLANNED_WFH = "planned_wfh"  # Planning to WFH (future)


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


class PublicHoliday(SQLModel, table=True):
    """Public holidays that are excluded from business days."""
    __tablename__ = "public_holidays"

    id: Optional[int] = Field(default=None, primary_key=True)
    date: dt.date = Field(index=True, unique=True)
    name: str
    region: str = Field(default="VIC")  # State/region code


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
    business_days: int  # Weekdays minus public holidays
    leave_days: int  # Annual leave + sick leave
    exempt_days: int  # Discretionary WFH exemptions
    work_days: int  # Business days - leave - exemptions (days you need to be in office or WFH)
    office_days: int  # Days actually in office
    wfh_days: int  # Regular WFH days (counts against target)
    planned_office_days: int = 0  # Future planned office days
    planned_wfh_days: int = 0  # Future planned WFH days
    office_percentage: float  # office_days / business_days (target: 50%)
    total_percentage: float = 0.0  # (office_days + planned_office_days) / business_days
    target_percentage: float = 50.0  # Minimum required office attendance (fixed at 50%)
