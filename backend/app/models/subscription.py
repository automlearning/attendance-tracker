from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class SubscriptionTier(str, Enum):
    FREE = "free"
    PAID = "paid"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"


# Tier limits configuration
TIER_LIMITS = {
    SubscriptionTier.FREE: {
        "ai_requests_per_month": 20,
        "calendar_sync_enabled": False,
        "history_days": 30,
        "natural_language_enabled": True,
        "predictive_analytics": False,
    },
    SubscriptionTier.PAID: {
        "ai_requests_per_month": 500,
        "calendar_sync_enabled": True,
        "history_days": 365,
        "natural_language_enabled": True,
        "predictive_analytics": True,
    },
}


class Subscription(SQLModel, table=True):
    __tablename__ = "subscriptions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    tier: SubscriptionTier = Field(default=SubscriptionTier.FREE)
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    status: SubscriptionStatus = Field(default=SubscriptionStatus.ACTIVE)
    current_period_end: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="subscription")


class SubscriptionRead(SQLModel):
    id: int
    user_id: int
    tier: SubscriptionTier
    status: SubscriptionStatus
    current_period_end: Optional[datetime]
