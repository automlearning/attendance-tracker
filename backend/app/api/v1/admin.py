from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func
from pydantic import BaseModel, EmailStr

from app.api.deps import get_db, get_current_admin_user
from app.models.user import User, UserRead, UserRole
from app.models.attendance import AttendanceLog
from app.models.subscription import Subscription, SubscriptionTier
from app.core.security import hash_password

router = APIRouter()


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.USER


class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class PlatformStats(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_attendance_logs: int
    paid_subscribers: int


class UserWithStats(UserRead):
    attendance_count: int
    subscription_tier: SubscriptionTier


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Get platform-wide statistics."""
    # Total users
    result = await db.execute(select(func.count(User.id)))
    total_users = result.scalar() or 0

    # Active users
    result = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    active_users = result.scalar() or 0

    # Admin users
    result = await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.ADMIN)
    )
    admin_users = result.scalar() or 0

    # Total attendance logs
    result = await db.execute(select(func.count(AttendanceLog.id)))
    total_logs = result.scalar() or 0

    # Paid subscribers
    result = await db.execute(
        select(func.count(Subscription.id)).where(Subscription.tier == SubscriptionTier.PAID)
    )
    paid_subscribers = result.scalar() or 0

    return PlatformStats(
        total_users=total_users,
        active_users=active_users,
        admin_users=admin_users,
        total_attendance_logs=total_logs,
        paid_subscribers=paid_subscribers,
    )


@router.get("/users", response_model=List[UserRead])
async def list_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    result = await db.execute(
        select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    )
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific user by ID (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Create subscription (free for regular users, admins don't need one but we create it anyway)
    subscription = Subscription(
        user_id=user.id,
        tier=SubscriptionTier.FREE,
    )
    db.add(subscription)
    await db.commit()

    return user


@router.put("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    user_update: AdminUserUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    update_data = user_update.model_dump(exclude_unset=True)

    # Check email uniqueness if updating email
    if "email" in update_data and update_data["email"] != user.email:
        result = await db.execute(
            select(User).where(User.email == update_data["email"])
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use",
            )

    for key, value in update_data.items():
        setattr(user, key, value)

    user.updated_at = datetime.utcnow()
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user (admin only). Does not delete, just sets is_active=False."""
    if user_id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.is_active = False
    user.updated_at = datetime.utcnow()
    db.add(user)
    await db.commit()


@router.post("/users/{user_id}/subscription")
async def override_subscription(
    user_id: int,
    tier: SubscriptionTier,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Override a user's subscription tier (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    subscription = result.scalar_one_or_none()

    if subscription:
        subscription.tier = tier
        subscription.updated_at = datetime.utcnow()
    else:
        subscription = Subscription(user_id=user_id, tier=tier)
        db.add(subscription)

    await db.commit()

    return {"message": f"User subscription updated to {tier.value}"}
