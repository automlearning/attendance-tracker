from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.api.deps import get_db, get_current_user
from app.models.user import User, UserRead, UserUpdate
from app.core.security import hash_password

router = APIRouter()


@router.get("/profile", response_model=UserRead)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile."""
    return current_user


@router.put("/profile", response_model=UserRead)
async def update_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile."""
    update_data = user_update.model_dump(exclude_unset=True)

    # Users can only update their own email and full_name
    allowed_fields = {"email", "full_name"}
    update_data = {k: v for k, v in update_data.items() if k in allowed_fields}

    # Check email uniqueness if updating email
    if "email" in update_data and update_data["email"] != current_user.email:
        result = await db.execute(
            select(User).where(User.email == update_data["email"])
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use",
            )

    for key, value in update_data.items():
        setattr(current_user, key, value)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return current_user
