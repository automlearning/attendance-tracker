"""Backup API endpoints for data export and database backup."""
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import io

from app.database import get_session
from app.config import settings
from app.models.user import User
from app.models.attendance import AttendanceLog, PublicHoliday
from app.models.target import Target
from app.core.security import get_current_user

router = APIRouter()


def serialize_for_json(obj):
    """Convert objects to JSON-serializable format."""
    if hasattr(obj, 'model_dump'):
        data = obj.model_dump()
    elif hasattr(obj, '__dict__'):
        data = {k: v for k, v in obj.__dict__.items() if not k.startswith('_')}
    else:
        return str(obj)

    # Convert datetime and date objects
    for key, value in data.items():
        if hasattr(value, 'isoformat'):
            data[key] = value.isoformat()
    return data


@router.get("/export")
async def export_user_data(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export all data for the current user as JSON.
    This can be used for personal backups or data portability.
    """
    # Get user's attendance logs
    attendance_result = await session.execute(
        select(AttendanceLog)
        .where(AttendanceLog.user_id == current_user.id)
        .order_by(AttendanceLog.date)
    )
    attendance_logs = attendance_result.scalars().all()

    # Get user's targets
    targets_result = await session.execute(
        select(Target)
        .where(Target.user_id == current_user.id)
        .order_by(Target.start_date)
    )
    targets = targets_result.scalars().all()

    # Get public holidays (shared data)
    holidays_result = await session.execute(
        select(PublicHoliday).order_by(PublicHoliday.date)
    )
    holidays = holidays_result.scalars().all()

    # Build export data
    export_data = {
        "export_date": datetime.utcnow().isoformat(),
        "user": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "target_percentage": current_user.target_percentage,
            "created_at": current_user.created_at.isoformat(),
        },
        "attendance_logs": [serialize_for_json(log) for log in attendance_logs],
        "targets": [serialize_for_json(target) for target in targets],
        "public_holidays": [serialize_for_json(holiday) for holiday in holidays],
        "statistics": {
            "total_attendance_records": len(attendance_logs),
            "total_targets": len(targets),
        }
    }

    # Create JSON file response
    json_str = json.dumps(export_data, indent=2, default=str)
    filename = f"attendance_backup_{current_user.email}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    return StreamingResponse(
        io.BytesIO(json_str.encode('utf-8')),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/export/full")
async def export_full_database(
    x_backup_secret: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_session),
):
    """
    Export full database as JSON (admin only via secret key).
    Used for scheduled backups to OneDrive or other storage.

    Requires X-Backup-Secret header matching BACKUP_SECRET env var.
    """
    # Verify backup secret
    if not settings.BACKUP_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Backup secret not configured. Set BACKUP_SECRET environment variable."
        )

    if x_backup_secret != settings.BACKUP_SECRET:
        raise HTTPException(status_code=403, detail="Invalid backup secret")

    # Get all users (without passwords)
    users_result = await session.execute(select(User))
    users = users_result.scalars().all()

    # Get all attendance logs
    attendance_result = await session.execute(
        select(AttendanceLog).order_by(AttendanceLog.date)
    )
    attendance_logs = attendance_result.scalars().all()

    # Get all targets
    targets_result = await session.execute(
        select(Target).order_by(Target.start_date)
    )
    targets = targets_result.scalars().all()

    # Get public holidays
    holidays_result = await session.execute(
        select(PublicHoliday).order_by(PublicHoliday.date)
    )
    holidays = holidays_result.scalars().all()

    # Build full export (exclude password hashes)
    export_data = {
        "export_date": datetime.utcnow().isoformat(),
        "backup_type": "full",
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role.value if hasattr(u.role, 'value') else u.role,
                "is_active": u.is_active,
                "target_percentage": u.target_percentage,
                "created_at": u.created_at.isoformat(),
                "updated_at": u.updated_at.isoformat(),
            }
            for u in users
        ],
        "attendance_logs": [serialize_for_json(log) for log in attendance_logs],
        "targets": [serialize_for_json(target) for target in targets],
        "public_holidays": [serialize_for_json(holiday) for holiday in holidays],
        "statistics": {
            "total_users": len(users),
            "total_attendance_records": len(attendance_logs),
            "total_targets": len(targets),
            "total_holidays": len(holidays),
        }
    }

    json_str = json.dumps(export_data, indent=2, default=str)
    filename = f"attendance_full_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    return StreamingResponse(
        io.BytesIO(json_str.encode('utf-8')),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
