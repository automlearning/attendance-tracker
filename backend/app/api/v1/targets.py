from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, and_

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.target import Target, TargetCreate, TargetRead, TargetUpdate, TargetProgress
from app.models.attendance import AttendanceLog, AttendanceStatus

router = APIRouter()


def count_workdays(start_date: date, end_date: date) -> int:
    """Count workdays (Mon-Fri) between two dates inclusive."""
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


def count_remaining_workdays(from_date: date, end_date: date) -> int:
    """Count remaining workdays from a date to end date."""
    if from_date > end_date:
        return 0
    return count_workdays(from_date, end_date)


@router.get("", response_model=List[TargetRead])
async def list_targets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all targets for current user."""
    result = await db.execute(
        select(Target)
        .where(Target.user_id == current_user.id)
        .order_by(Target.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=TargetRead, status_code=status.HTTP_201_CREATED)
async def create_target(
    target: TargetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new target."""
    if target.period_start > target.period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before end date",
        )

    # Deactivate other active targets
    result = await db.execute(
        select(Target).where(
            and_(
                Target.user_id == current_user.id,
                Target.is_active == True,
            )
        )
    )
    for existing_target in result.scalars().all():
        existing_target.is_active = False
        db.add(existing_target)

    new_target = Target(
        **target.model_dump(),
        user_id=current_user.id,
        is_active=True,
    )
    db.add(new_target)
    await db.commit()
    await db.refresh(new_target)

    return new_target


@router.get("/current", response_model=TargetRead)
async def get_current_target(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current active target."""
    result = await db.execute(
        select(Target).where(
            and_(
                Target.user_id == current_user.id,
                Target.is_active == True,
            )
        )
    )
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active target found",
        )

    return target


@router.get("/progress", response_model=TargetProgress)
async def get_target_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get progress toward the current active target."""
    # Get active target
    result = await db.execute(
        select(Target).where(
            and_(
                Target.user_id == current_user.id,
                Target.is_active == True,
            )
        )
    )
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active target found",
        )

    # Get attendance logs for target period
    result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.user_id == current_user.id,
                AttendanceLog.date >= target.period_start,
                AttendanceLog.date <= target.period_end,
            )
        )
    )
    logs = result.scalars().all()

    # Calculate stats
    in_office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE)
    wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH)
    logged_workdays = in_office_days + wfh_days

    today = date.today()
    effective_end = min(target.period_end, today)
    total_workdays = count_workdays(target.period_start, effective_end)
    days_remaining = count_remaining_workdays(today + timedelta(days=1), target.period_end)

    # Current percentage
    current_percentage = (in_office_days / logged_workdays * 100) if logged_workdays > 0 else 0

    # Calculate days needed to meet target
    total_period_workdays = count_workdays(target.period_start, target.period_end)
    target_office_days = int(total_period_workdays * target.office_percentage / 100)
    days_needed = max(0, target_office_days - in_office_days)

    # Check if on track
    on_track = current_percentage >= target.office_percentage or days_needed <= days_remaining

    return TargetProgress(
        target=TargetRead(
            id=target.id,
            user_id=target.user_id,
            period_type=target.period_type,
            period_start=target.period_start,
            period_end=target.period_end,
            office_percentage=target.office_percentage,
            is_active=target.is_active,
            created_at=target.created_at,
        ),
        current_percentage=round(current_percentage, 1),
        days_in_office=in_office_days,
        total_workdays=total_workdays,
        days_remaining=days_remaining,
        days_needed_to_meet_target=days_needed,
        on_track=on_track,
    )


@router.put("/{target_id}", response_model=TargetRead)
async def update_target(
    target_id: int,
    target_update: TargetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a target."""
    result = await db.execute(
        select(Target).where(
            and_(
                Target.id == target_id,
                Target.user_id == current_user.id,
            )
        )
    )
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found",
        )

    update_data = target_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(target, key, value)

    db.add(target)
    await db.commit()
    await db.refresh(target)

    return target


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(
    target_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a target."""
    result = await db.execute(
        select(Target).where(
            and_(
                Target.id == target_id,
                Target.user_id == current_user.id,
            )
        )
    )
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found",
        )

    await db.delete(target)
    await db.commit()
