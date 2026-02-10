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
)

router = APIRouter()


def count_workdays(start_date: date, end_date: date) -> int:
    """Count workdays (Mon-Fri) between two dates inclusive."""
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Monday = 0, Friday = 4
            count += 1
        current += timedelta(days=1)
    return count


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

    Attendance % = (Working Days - Annual Leave - Sick Days) / Total Working Days
    Office % = In Office Days / (In Office + WFH Days)
    """
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

    in_office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE)
    wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH)
    annual_leave_days = sum(1 for log in logs if log.status == AttendanceStatus.ANNUAL_LEAVE)
    sick_leave_days = sum(1 for log in logs if log.status == AttendanceStatus.SICK_LEAVE)

    total_workdays = count_workdays(start_date, end_date)

    # Attendance % = (Working Days - Annual Leave - Sick Days) / Total Working Days
    days_worked = total_workdays - annual_leave_days - sick_leave_days
    attendance_percentage = (days_worked / total_workdays * 100) if total_workdays > 0 else 0

    # Office % = In Office / (In Office + WFH)
    present_days = in_office_days + wfh_days
    office_percentage = (in_office_days / present_days * 100) if present_days > 0 else 0

    return AttendanceSummary(
        period_start=start_date,
        period_end=end_date,
        total_workdays=total_workdays,
        in_office_days=in_office_days,
        wfh_days=wfh_days,
        annual_leave_days=annual_leave_days,
        sick_leave_days=sick_leave_days,
        attendance_percentage=round(attendance_percentage, 1),
        office_percentage=round(office_percentage, 1),
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
