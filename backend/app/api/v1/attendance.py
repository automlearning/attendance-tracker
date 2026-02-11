from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, and_

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.attendance import (
    AttendanceLog,
    AttendanceLogCreate,
    AttendanceLogRead,
    AttendanceLogUpdate,
    AttendanceStatus,
    AttendanceSummary,
    PublicHoliday,
)

router = APIRouter()


def count_weekdays(start_date: date, end_date: date) -> int:
    """Count weekdays (Mon-Fri) between two dates inclusive."""
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Monday = 0, Friday = 4
            count += 1
        current += timedelta(days=1)
    return count


async def count_business_days(
    start_date: date, end_date: date, db: AsyncSession
) -> tuple[int, int]:
    """Count business days (weekdays minus public holidays).

    Returns: (business_days, public_holiday_count)
    """
    weekdays = count_weekdays(start_date, end_date)

    # Get public holidays in the period
    result = await db.execute(
        select(PublicHoliday).where(
            and_(
                PublicHoliday.date >= start_date,
                PublicHoliday.date <= end_date,
            )
        )
    )
    holidays = result.scalars().all()

    # Only count holidays that fall on weekdays
    holiday_count = sum(1 for h in holidays if h.date.weekday() < 5)

    return weekdays - holiday_count, holiday_count


@router.get("", response_model=List[AttendanceLogRead])
async def list_attendance(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List attendance logs for current user."""
    query = select(AttendanceLog).where(AttendanceLog.user_id == current_user.id)

    if start_date:
        query = query.where(AttendanceLog.date >= start_date)
    if end_date:
        query = query.where(AttendanceLog.date <= end_date)

    query = query.order_by(AttendanceLog.date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=AttendanceLogRead, status_code=status.HTTP_201_CREATED)
async def create_attendance(
    attendance: AttendanceLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new attendance entry."""
    # Check if entry already exists for this date
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.user_id == current_user.id,
                AttendanceLog.date == attendance.date,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance already logged for this date. Use PUT to update.",
        )

    log = AttendanceLog(
        **attendance.model_dump(),
        user_id=current_user.id,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    return log


@router.put("/{log_id}", response_model=AttendanceLogRead)
async def update_attendance(
    log_id: int,
    attendance_update: AttendanceLogUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an attendance entry."""
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.id == log_id,
                AttendanceLog.user_id == current_user.id,
            )
        )
    )
    log = result.scalar_one_or_none()

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance log not found",
        )

    update_data = attendance_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(log, key, value)

    log.updated_at = datetime.utcnow()
    db.add(log)
    await db.commit()
    await db.refresh(log)

    return log


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an attendance entry."""
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.id == log_id,
                AttendanceLog.user_id == current_user.id,
            )
        )
    )
    log = result.scalar_one_or_none()

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance log not found",
        )

    await db.delete(log)
    await db.commit()


@router.get("/summary", response_model=AttendanceSummary)
async def get_attendance_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get attendance summary for a period.

    Formula:
    - Business Days = Weekdays (Mon-Fri) - Public Holidays
    - Office % = Office Days / Business Days (target: 50%)
    - Each month is independent - no carryover
    - Weekends are excluded from all calculations
    """
    # Get attendance logs
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.user_id == current_user.id,
                AttendanceLog.date >= start_date,
                AttendanceLog.date <= end_date,
            )
        )
    )
    logs = result.scalars().all()

    # Count by status - office days in the future are automatically "planned"
    today = date.today()

    # Actual office days = in_office on or before today
    office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE and log.date <= today)

    # Planned office days = in_office in the future OR explicitly planned_office
    planned_office_days = sum(1 for log in logs if
        (log.status == AttendanceStatus.IN_OFFICE and log.date > today) or
        log.status == AttendanceStatus.PLANNED_OFFICE
    )

    # WFH counts
    wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH and log.date <= today)
    planned_wfh_days = sum(1 for log in logs if
        (log.status == AttendanceStatus.WFH and log.date > today) or
        log.status == AttendanceStatus.PLANNED_WFH
    )

    exempt_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH_EXEMPT)
    annual_leave = sum(1 for log in logs if log.status == AttendanceStatus.ANNUAL_LEAVE)
    sick_leave = sum(1 for log in logs if log.status == AttendanceStatus.SICK_LEAVE)

    # Calculate business days (weekdays - public holidays)
    business_days, _ = await count_business_days(start_date, end_date, db)

    # Leave days = annual + sick
    leave_days = annual_leave + sick_leave

    # Work days = business days minus leave/exempt
    # These are the days you're expected to work (denominator for percentage)
    work_days = business_days - leave_days - exempt_days

    # Office % = Office Days / Work Days (excludes leave/exempt from denominator)
    # This gives the true percentage of "eligible" days you went to office
    office_percentage = round(office_days / work_days * 100) if work_days > 0 else 0

    # Total % = (Office Days + Planned Office Days) / Work Days
    # This shows what the percentage would be if all planned days are completed
    total_percentage = round((office_days + planned_office_days) / work_days * 100) if work_days > 0 else 0

    return AttendanceSummary(
        period_start=start_date,
        period_end=end_date,
        business_days=business_days,
        leave_days=leave_days,
        exempt_days=exempt_days,
        work_days=work_days,
        office_days=office_days,
        wfh_days=wfh_days,
        planned_office_days=planned_office_days,
        planned_wfh_days=planned_wfh_days,
        office_percentage=office_percentage,
        total_percentage=total_percentage,
        target_percentage=50.0,  # Fixed at 50%
    )


@router.get("/calendar", response_model=List[AttendanceLogRead])
async def get_calendar_view(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get attendance for calendar view (specific month)."""
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.user_id == current_user.id,
                AttendanceLog.date >= start_date,
                AttendanceLog.date <= end_date,
            )
        ).order_by(AttendanceLog.date)
    )
    return result.scalars().all()


@router.post("/quick", response_model=AttendanceLogRead)
async def quick_log(
    status: AttendanceStatus,
    log_date: Optional[date] = Query(None, description="Date to log, defaults to today"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quick log attendance for today or specified date."""
    target_date = log_date or date.today()

    # Check if entry exists
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.user_id == current_user.id,
                AttendanceLog.date == target_date,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing
        existing.status = status
        existing.updated_at = datetime.utcnow()
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
        return existing
    else:
        # Create new
        log = AttendanceLog(
            date=target_date,
            status=status,
            user_id=current_user.id,
        )
        db.add(log)
        await db.commit()
        await db.refresh(log)
        return log
