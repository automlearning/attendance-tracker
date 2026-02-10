from typing import AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import async_session
from app.core.security import decode_access_token
from app.models.user import User, UserRole
from app.models.subscription import Subscription, SubscriptionTier, TIER_LIMITS

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get the current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: int = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    return user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current user if they are an admin."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def get_user_subscription(
    db: AsyncSession,
    user_id: int,
) -> Subscription:
    """Get user's subscription, creating free tier if none exists."""
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    subscription = result.scalar_one_or_none()

    if subscription is None:
        subscription = Subscription(user_id=user_id, tier=SubscriptionTier.FREE)
        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)

    return subscription


async def check_paid_tier(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Check if user has paid tier (admins always pass)."""
    if current_user.role == UserRole.ADMIN:
        return current_user

    subscription = await get_user_subscription(db, current_user.id)
    if subscription.tier != SubscriptionTier.PAID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature requires a paid subscription",
        )
    return current_user


def get_tier_limit(tier: SubscriptionTier, feature: str):
    """Get the limit for a specific feature based on tier."""
    return TIER_LIMITS.get(tier, TIER_LIMITS[SubscriptionTier.FREE]).get(feature)
