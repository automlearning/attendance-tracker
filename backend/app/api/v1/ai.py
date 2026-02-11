from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, and_
from pydantic import BaseModel
import calendar

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.attendance import AttendanceStatus, AttendanceSource, AttendanceLog, PublicHoliday
from app.services.ai_service import AIService

router = APIRouter()


class NaturalLanguageRequest(BaseModel):
    text: str


class ParsedAttendanceEntry(BaseModel):
    date: date
    status: AttendanceStatus
    confidence: float = 1.0


class NaturalLanguageResponse(BaseModel):
    success: bool
    entries: List[ParsedAttendanceEntry]
    message: Optional[str] = None


class Suggestion(BaseModel):
    type: str  # reminder, recommendation, warning
    message: str
    priority: int  # 1-3, 1 being highest


class SuggestionsResponse(BaseModel):
    suggestions: List[Suggestion]


class GreetingResponse(BaseModel):
    greeting: str
    features: List[str]
    quick_tip: str


class CoachingResponse(BaseModel):
    status: str  # on_track, at_risk, behind, no_data
    headline: str
    message: str
    action_items: List[str]
    stats: dict


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    suggestions: Optional[List[str]] = None


@router.get("/greeting", response_model=GreetingResponse)
async def get_greeting(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI greeting with personalized onboarding message."""
    ai_service = AIService()
    greeting_data = await ai_service.generate_greeting(
        user_name=current_user.full_name,
        user_id=current_user.id,
        db=db,
    )
    return GreetingResponse(**greeting_data)


@router.post("/parse-natural-language", response_model=NaturalLanguageResponse)
async def parse_natural_language(
    request: NaturalLanguageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse natural language input into attendance entries."""
    if not request.text.strip():
        return NaturalLanguageResponse(
            success=False,
            entries=[],
            message="Please provide some text to parse",
        )

    ai_service = AIService()
    try:
        entries = await ai_service.parse_natural_language(
            user_input=request.text,
            current_date=date.today(),
        )

        if not entries:
            return NaturalLanguageResponse(
                success=False,
                entries=[],
                message="Could not understand the input. Try something like 'I was in office Monday and Tuesday'",
            )

        return NaturalLanguageResponse(
            success=True,
            entries=entries,
            message=f"Found {len(entries)} attendance entries",
        )

    except Exception as e:
        return NaturalLanguageResponse(
            success=False,
            entries=[],
            message=f"Error processing request: {str(e)}",
        )


@router.get("/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI-powered suggestions for the user."""
    ai_service = AIService()
    try:
        suggestions = await ai_service.generate_suggestions(
            user_id=current_user.id,
            db=db,
        )
        return SuggestionsResponse(suggestions=suggestions)
    except Exception as e:
        # Return empty suggestions on error
        return SuggestionsResponse(suggestions=[])


def count_weekdays(start_date: date, end_date: date) -> int:
    """Count weekdays between two dates."""
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


@router.get("/coaching", response_model=CoachingResponse)
async def get_coaching(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get personalized AI coaching on meeting your 50% office target.

    Calculation:
    - Office % = Office Days / Total Business Days in the month
    - Business Days = Weekdays (Mon-Fri) - Public Holidays
    - Target: 50% of business days should be in office
    - Each month is independent - no carryover
    """
    today = date.today()
    month_start = today.replace(day=1)
    month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])

    # Get attendance logs for this month
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

    # Get public holidays
    holiday_result = await db.execute(
        select(PublicHoliday).where(
            and_(
                PublicHoliday.date >= month_start,
                PublicHoliday.date <= month_end,
            )
        )
    )
    holidays = {h.date for h in holiday_result.scalars().all()}

    # Calculate stats - separate actual (past/today) from planned (future)
    # Actual office days = in_office on or before today
    office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE and log.date <= today)
    # Planned office days = in_office in the future
    planned_office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE and log.date > today)

    wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH and log.date <= today)
    leave_days = sum(1 for log in logs if log.status in [AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.SICK_LEAVE])
    exempt_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH_EXEMPT)

    # Count total business days for the month (weekdays - holidays)
    total_weekdays = count_weekdays(month_start, month_end)
    holiday_count = sum(1 for h in holidays if h.weekday() < 5)
    business_days = total_weekdays - holiday_count

    # Remaining business days (from tomorrow to end of month)
    remaining_weekdays = count_weekdays(today + timedelta(days=1), month_end)
    remaining_holidays = sum(1 for h in holidays if h > today and h.weekday() < 5)
    remaining_business_days = remaining_weekdays - remaining_holidays

    # Work days = business days minus leave and exempt days
    # These days shouldn't count in the denominator for percentage calculation
    work_days = business_days - leave_days - exempt_days

    # Current percentage = Office Days / Work Days (not business days)
    # This gives true percentage of "eligible" days you went to office
    current_pct = round(office_days / work_days * 100) if work_days > 0 else 0

    # Use user's configured target (defaults to 50%)
    target_pct = current_user.target_percentage
    target_office_days = int(work_days * target_pct / 100 + 0.5)  # Round to nearest
    days_needed = max(0, target_office_days - office_days)
    days_ahead = office_days - target_office_days

    # Can they still meet target?
    can_meet_target = days_needed <= remaining_business_days

    # Determine status and generate coaching
    first_name = current_user.full_name.split()[0] if current_user.full_name else "there"

    stats = {
        "office_days": office_days,
        "planned_office_days": planned_office_days,
        "wfh_days": wfh_days,
        "leave_days": leave_days,
        "exempt_days": exempt_days,
        "business_days": business_days,
        "work_days": work_days,
        "remaining_days": remaining_business_days,
        "current_percentage": current_pct,
        "target_percentage": target_pct,
        "target_office_days": target_office_days,
        "days_needed": days_needed,
        "days_ahead": days_ahead,
        "can_meet_target": can_meet_target,
    }

    if office_days == 0 and wfh_days == 0 and leave_days == 0:
        return CoachingResponse(
            status="no_data",
            headline=f"Welcome, {first_name}! Let's get started.",
            message="You haven't logged any attendance yet this month. Start by logging today's attendance to begin tracking your office attendance target.",
            action_items=[
                "Log today's attendance using the quick buttons above",
                "Your target is 50% office attendance (about 5 days per fortnight)",
                "I'll track your progress and give you personalized advice",
            ],
            stats=stats,
        )

    if current_pct >= target_pct:
        # On track or ahead - already at or above target
        extra_wfh_allowed = office_days - target_office_days
        return CoachingResponse(
            status="on_track",
            headline=f"Great job, {first_name}! You've hit your target.",
            message=f"You're at {current_pct}% office attendance ({office_days} of {work_days} work days). You've already met your {int(target_pct)}% target for this month!",
            action_items=[
                f"Target: {target_office_days} office days | You have: {office_days} office days",
                f"You're {abs(days_ahead)} day(s) ahead of your {int(target_pct)}% target",
                f"You have {remaining_business_days} business days remaining this month",
                f"You can WFH for the rest of the month and still exceed {int(target_pct)}%" if extra_wfh_allowed > 0 else "Keep it up!",
            ],
            stats=stats,
        )

    elif can_meet_target:
        # Behind but can catch up
        urgency = "soon" if days_needed > remaining_business_days * 0.7 else "over the coming weeks"
        return CoachingResponse(
            status="at_risk",
            headline=f"Heads up, {first_name}! You need more office days.",
            message=f"You're at {current_pct}% ({office_days} of {work_days} work days). You need {days_needed} more office day(s) to reach {int(target_pct)}%.",
            action_items=[
                f"Target: {target_office_days} office days | You have: {office_days} office days",
                f"You need {days_needed} more office day(s) to hit {int(target_pct)}%",
                f"You have {remaining_business_days} work days remaining - enough time!",
                f"Suggestion: Go to office {urgency}",
            ],
            stats=stats,
        )

    else:
        # Cannot meet target
        max_possible_pct = (office_days + remaining_business_days) / work_days * 100 if work_days > 0 else 0
        return CoachingResponse(
            status="behind",
            headline=f"{first_name}, you can't reach {int(target_pct)}% this month.",
            message=f"You're at {current_pct}% ({office_days} of {work_days} work days). With only {remaining_business_days} days left, the maximum you can reach is {round(max_possible_pct)}%.",
            action_items=[
                f"Target: {target_office_days} office days | You have: {office_days} office days",
                f"Even with all remaining days in office, you'll reach {round(max_possible_pct)}%",
                "Maximize office days this month to get as close as possible",
                "Plan ahead for next month - each month starts fresh at 0%",
            ],
            stats=stats,
        )


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chat with AI about your attendance, targets, or get help."""
    if not request.message.strip():
        return ChatResponse(
            response="Please type a message to start chatting!",
            suggestions=["How am I doing this month?", "What's my target?", "Tips for meeting my target"],
        )

    ai_service = AIService()

    # Get user's current stats for context
    today = date.today()
    month_start = today.replace(day=1)
    month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])

    # Get attendance logs
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

    # Get public holidays
    holiday_result = await db.execute(
        select(PublicHoliday).where(
            and_(
                PublicHoliday.date >= month_start,
                PublicHoliday.date <= month_end,
            )
        )
    )
    holidays = {h.date for h in holiday_result.scalars().all()}

    # Calculate stats - separate actual (past/today) from planned (future)
    office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE and log.date <= today)
    planned_office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE and log.date > today)
    wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH and log.date <= today)
    leave_days = sum(1 for log in logs if log.status in [AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.SICK_LEAVE])
    exempt_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH_EXEMPT)

    # Calculate business days
    total_weekdays = count_weekdays(month_start, month_end)
    holiday_count = sum(1 for h in holidays if h.weekday() < 5)
    business_days = total_weekdays - holiday_count

    # Work days = business days minus leave and exempt
    work_days = business_days - leave_days - exempt_days

    remaining_weekdays = count_weekdays(today + timedelta(days=1), month_end)
    remaining_holidays = sum(1 for h in holidays if h > today and h.weekday() < 5)
    remaining_days = remaining_weekdays - remaining_holidays

    # Use work_days for percentage calculation (excludes leave/exempt)
    current_pct = round(office_days / work_days * 100) if work_days > 0 else 0
    target_pct = current_user.target_percentage
    target_office_days = int(work_days * target_pct / 100 + 0.5)
    days_needed = max(0, target_office_days - office_days)

    context = {
        "user_name": current_user.full_name,
        "target_percentage": target_pct,
        "current_percentage": current_pct,
        "office_days": office_days,
        "planned_office_days": planned_office_days,
        "wfh_days": wfh_days,
        "leave_days": leave_days,
        "exempt_days": exempt_days,
        "business_days": business_days,
        "work_days": work_days,
        "remaining_days": remaining_days,
        "days_needed": days_needed,
        "target_office_days": target_office_days,
    }

    try:
        response = await ai_service.chat(
            message=request.message,
            context=context,
        )
        return ChatResponse(
            response=response,
            suggestions=["How many more days do I need?", "What if I WFH tomorrow?", "Plan my week"],
        )
    except Exception as e:
        return ChatResponse(
            response=f"Sorry, I had trouble processing that. Could you try rephrasing? Error: {str(e)}",
            suggestions=["How am I doing?", "What's my target?"],
        )


def _get_suggested_days(remaining_days: int, days_needed: int) -> str:
    """Generate suggested days to go to office."""
    if days_needed <= 0:
        return "any days you prefer"
    if days_needed >= remaining_days:
        return "all remaining work days"
    if days_needed <= 2:
        return "the next 2 work days"
    if days_needed <= 5:
        return "at least 3 days this week"
    return f"about {days_needed // (remaining_days // 5 + 1)} days per week"
