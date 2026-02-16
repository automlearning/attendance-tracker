from datetime import date, datetime, timedelta
from typing import List, Optional
import random
# Force reload
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, and_, delete

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


@router.post("/generate-test-data")
async def generate_test_data(
    months: int = Query(6, ge=1, le=12, description="Number of months to generate"),
    clear_existing: bool = Query(False, description="Clear existing data first"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate test attendance data for testing formulas.

    Creates realistic attendance patterns:
    - Some months above 50% target, some below
    - Mix of office, WFH, leave, sick days
    - Weekends excluded
    - Varying patterns per month
    """
    today = date.today()

    if clear_existing:
        # Delete all existing logs for this user
        await db.execute(
            delete(AttendanceLog).where(AttendanceLog.user_id == current_user.id)
        )
        await db.commit()

    created_count = 0
    monthly_stats = []

    # Define different monthly patterns (office_weight, wfh_weight, leave_weight, sick_weight)
    patterns = [
        (0.6, 0.35, 0.03, 0.02),   # Good month: 60% office
        (0.45, 0.50, 0.03, 0.02),  # Below target: 45% office
        (0.55, 0.40, 0.03, 0.02),  # Just above target
        (0.70, 0.25, 0.03, 0.02),  # Great month: 70% office
        (0.40, 0.55, 0.03, 0.02),  # Poor month: 40% office
        (0.52, 0.43, 0.03, 0.02),  # Borderline: 52% office
    ]

    for i in range(months):
        # Calculate month start/end (go backwards from current month)
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1

        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(year, month + 1, 1) - timedelta(days=1)

        # For current month, only go up to today
        if i == 0:
            month_end = min(month_end, today)

        # Get pattern for this month (cycle through patterns)
        pattern = patterns[i % len(patterns)]
        office_weight, wfh_weight, leave_weight, sick_weight = pattern

        # Generate data for each weekday in the month
        current_date = month_start
        month_office = 0
        month_wfh = 0
        month_leave = 0
        month_sick = 0

        while current_date <= month_end:
            # Skip weekends
            if current_date.weekday() < 5:  # Monday = 0, Friday = 4
                # Check if entry already exists
                result = await db.execute(
                    select(AttendanceLog).where(
                        and_(
                            AttendanceLog.user_id == current_user.id,
                            AttendanceLog.date == current_date,
                        )
                    )
                )
                existing = result.scalar_one_or_none()

                if not existing:
                    # Randomly assign status based on weights
                    rand = random.random()
                    if rand < office_weight:
                        att_status = AttendanceStatus.IN_OFFICE
                        month_office += 1
                    elif rand < office_weight + wfh_weight:
                        att_status = AttendanceStatus.WFH
                        month_wfh += 1
                    elif rand < office_weight + wfh_weight + leave_weight:
                        att_status = AttendanceStatus.ANNUAL_LEAVE
                        month_leave += 1
                    else:
                        att_status = AttendanceStatus.SICK_LEAVE
                        month_sick += 1

                    log = AttendanceLog(
                        date=current_date,
                        status=att_status,
                        user_id=current_user.id,
                    )
                    db.add(log)
                    created_count += 1

            current_date += timedelta(days=1)

        await db.commit()

        # Calculate stats for this month
        total_work_days = month_office + month_wfh + month_leave + month_sick
        office_pct = round(month_office / total_work_days * 100, 1) if total_work_days > 0 else 0

        monthly_stats.append({
            "month": month_start.strftime("%b %Y"),
            "office_days": month_office,
            "wfh_days": month_wfh,
            "leave_days": month_leave,
            "sick_days": month_sick,
            "total_days": total_work_days,
            "office_percentage": office_pct,
            "met_target": office_pct >= 50,
        })

    return {
        "success": True,
        "message": f"Generated {created_count} attendance records across {months} months",
        "monthly_stats": monthly_stats,
    }


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


@router.get("/monthly-history")
async def get_monthly_history(
    months: int = Query(6, ge=1, le=12, description="Number of months to include"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get monthly attendance statistics for the past N months."""
    today = date.today()
    history = []

    for i in range(months):
        # Calculate month start/end
        if i == 0:
            month_start = date(today.year, today.month, 1)
            month_end = today  # Current month ends at today
        else:
            # Go back i months
            year = today.year
            month = today.month - i
            while month <= 0:
                month += 12
                year -= 1
            month_start = date(year, month, 1)
            # End of month
            if month == 12:
                month_end = date(year + 1, 1, 1) - timedelta(days=1)
            else:
                month_end = date(year, month + 1, 1) - timedelta(days=1)

        # Get logs for this month
        result = await db.execute(
            select(AttendanceLog).where(
                and_(
                    AttendanceLog.user_id == current_user.id,
                    AttendanceLog.date >= month_start,
                    AttendanceLog.date <= month_end,
                )
            )
        )
        logs = result.scalars().all()

        # Count by status
        office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE and log.date <= today)
        wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH and log.date <= today)
        exempt_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH_EXEMPT)
        annual_leave = sum(1 for log in logs if log.status == AttendanceStatus.ANNUAL_LEAVE)
        sick_leave = sum(1 for log in logs if log.status == AttendanceStatus.SICK_LEAVE)
        leave_days = annual_leave + sick_leave

        # Calculate business days
        business_days, _ = await count_business_days(month_start, month_end, db)
        work_days = business_days - leave_days - exempt_days

        # Calculate percentage
        office_percentage = round(office_days / work_days * 100, 1) if work_days > 0 else 0

        history.append({
            "month": month_start.strftime("%b %Y"),
            "month_start": month_start.isoformat(),
            "month_end": month_end.isoformat(),
            "business_days": business_days,
            "work_days": work_days,
            "office_days": office_days,
            "wfh_days": wfh_days,
            "leave_days": leave_days,
            "exempt_days": exempt_days,
            "office_percentage": office_percentage,
            "target_percentage": 50.0,
            "met_target": office_percentage >= 50,
        })

    return history


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
