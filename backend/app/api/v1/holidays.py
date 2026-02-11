from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, and_
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user, get_current_admin_user
from app.models.user import User
from app.models.attendance import PublicHoliday

router = APIRouter()


class HolidayCreate(BaseModel):
    date: date
    name: str
    region: str = "VIC"


class HolidayRead(BaseModel):
    id: int
    date: date
    name: str
    region: str


@router.get("", response_model=List[HolidayRead])
async def list_holidays(
    year: Optional[int] = Query(None),
    region: str = Query("VIC"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List public holidays, optionally filtered by year."""
    query = select(PublicHoliday).where(PublicHoliday.region == region)

    if year:
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        query = query.where(
            and_(
                PublicHoliday.date >= start,
                PublicHoliday.date <= end,
            )
        )

    query = query.order_by(PublicHoliday.date)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=HolidayRead, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    holiday: HolidayCreate,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new public holiday (admin only)."""
    # Check if holiday already exists
    result = await db.execute(
        select(PublicHoliday).where(PublicHoliday.date == holiday.date)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Holiday already exists for this date",
        )

    db_holiday = PublicHoliday(**holiday.model_dump())
    db.add(db_holiday)
    await db.commit()
    await db.refresh(db_holiday)
    return db_holiday


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday(
    holiday_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a public holiday (admin only)."""
    result = await db.execute(
        select(PublicHoliday).where(PublicHoliday.id == holiday_id)
    )
    holiday = result.scalar_one_or_none()

    if not holiday:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Holiday not found",
        )

    await db.delete(holiday)
    await db.commit()


@router.post("/seed-vic-fy26", status_code=status.HTTP_201_CREATED)
async def seed_vic_fy26_holidays(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Seed Victorian FY26 public holidays (July 2025 - June 2026)."""
    vic_holidays = [
        # FY26: July 2025 - June 2026
        (date(2025, 10, 3), "Friday before AFL Grand Final"),
        (date(2025, 11, 4), "Melbourne Cup Day"),
        (date(2025, 12, 25), "Christmas Day"),
        (date(2025, 12, 26), "Boxing Day"),
        (date(2026, 1, 1), "New Year's Day"),
        (date(2026, 1, 26), "Australia Day"),
        (date(2026, 3, 9), "Labour Day"),
        (date(2026, 4, 3), "Good Friday"),
        (date(2026, 4, 4), "Saturday before Easter Sunday"),
        (date(2026, 4, 5), "Easter Sunday"),
        (date(2026, 4, 6), "Easter Monday"),
        (date(2026, 4, 25), "Anzac Day"),
        (date(2026, 6, 8), "Queen's Birthday"),
    ]

    added = 0
    for holiday_date, name in vic_holidays:
        # Check if already exists
        result = await db.execute(
            select(PublicHoliday).where(PublicHoliday.date == holiday_date)
        )
        if not result.scalar_one_or_none():
            holiday = PublicHoliday(date=holiday_date, name=name, region="VIC")
            db.add(holiday)
            added += 1

    await db.commit()
    return {"message": f"Added {added} holidays", "total": len(vic_holidays)}
