import json
from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, and_

from app.config import settings
from app.models.attendance import AttendanceLog, AttendanceStatus

# Try to import anthropic, but don't fail if not installed
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False


class ParsedEntry:
    def __init__(self, date: date, status: AttendanceStatus, confidence: float = 1.0):
        self.date = date
        self.status = status
        self.confidence = confidence


class Suggestion:
    def __init__(self, type: str, message: str, priority: int):
        self.type = type
        self.message = message
        self.priority = priority


NATURAL_LANGUAGE_PARSE_PROMPT = """You are an attendance parsing assistant. Parse the user's natural language input into structured attendance entries.

Current date: {current_date} ({current_day})

User input: "{user_input}"

Rules:
1. Valid statuses: "in_office", "wfh", "annual_leave", "sick_leave"
2. Interpret relative dates (yesterday, last Monday, etc.) based on current date
3. Handle date ranges (Jan 15-17, Monday to Wednesday)
4. Default to "in_office" if status is ambiguous but location mentioned
5. Only include workdays (Monday-Friday) unless explicitly stated
6. For leave/vacation/holiday/PTO/time off -> use "annual_leave"
7. For sick/ill/unwell/doctor -> use "sick_leave"

Respond with ONLY a valid JSON array of objects with "date" (YYYY-MM-DD format) and "status" fields.
If the input is unclear or invalid, respond with an empty array [].

Example response:
[{{"date": "2026-02-09", "status": "in_office"}}, {{"date": "2026-02-10", "status": "sick_leave"}}]"""


class AIService:
    def __init__(self):
        self.client = None
        self.model = "claude-sonnet-4-20250514"

        if ANTHROPIC_AVAILABLE and settings.ANTHROPIC_API_KEY:
            self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def parse_natural_language(
        self,
        user_input: str,
        current_date: date,
    ) -> List[dict]:
        """Parse natural language input into structured attendance entries."""

        # If no AI available, use simple fallback parsing
        if not self.client:
            return self._fallback_parse(user_input, current_date)

        prompt = NATURAL_LANGUAGE_PARSE_PROMPT.format(
            user_input=user_input,
            current_date=current_date.isoformat(),
            current_day=current_date.strftime("%A"),
        )

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )

            # Parse JSON response
            content = response.content[0].text.strip()
            entries = json.loads(content)

            # Validate and convert entries
            result = []
            for entry in entries:
                try:
                    entry_date = date.fromisoformat(entry["date"])
                    status = AttendanceStatus(entry["status"])
                    result.append({
                        "date": entry_date,
                        "status": status,
                        "confidence": 1.0,
                    })
                except (ValueError, KeyError):
                    continue

            return result

        except Exception as e:
            # Fallback to simple parsing on error
            return self._fallback_parse(user_input, current_date)

    def _fallback_parse(self, user_input: str, current_date: date) -> List[dict]:
        """Simple fallback parsing without AI."""
        entries = []
        text = user_input.lower()

        # Detect status
        status = AttendanceStatus.IN_OFFICE
        if "wfh" in text or "work from home" in text or "remote" in text:
            status = AttendanceStatus.WFH
        elif "sick" in text or "ill" in text or "unwell" in text or "doctor" in text:
            status = AttendanceStatus.SICK_LEAVE
        elif "leave" in text or "off" in text or "vacation" in text or "pto" in text or "holiday" in text:
            status = AttendanceStatus.ANNUAL_LEAVE

        # Detect date
        target_date = current_date

        if "today" in text:
            target_date = current_date
        elif "yesterday" in text:
            target_date = current_date - timedelta(days=1)

        # Check for day names
        day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for i, day_name in enumerate(day_names):
            if day_name in text:
                # Find the most recent occurrence of this day
                days_back = (current_date.weekday() - i) % 7
                if days_back == 0 and "last" in text:
                    days_back = 7
                target_date = current_date - timedelta(days=days_back)
                entries.append({
                    "date": target_date,
                    "status": status,
                    "confidence": 0.7,
                })

        # If no day names found, use today
        if not entries:
            entries.append({
                "date": target_date,
                "status": status,
                "confidence": 0.5,
            })

        return entries

    async def generate_greeting(
        self,
        user_name: str,
        user_id: int,
        db: AsyncSession,
    ) -> dict:
        """Generate a personalized greeting with onboarding info."""
        first_name = user_name.split()[0] if user_name else "there"

        # Check if user has any attendance logs (new user detection)
        result = await db.execute(
            select(AttendanceLog).where(AttendanceLog.user_id == user_id).limit(1)
        )
        has_logs = result.scalar_one_or_none() is not None

        if not has_logs:
            # New user - provide onboarding
            greeting = f"Welcome, {first_name}! I'm your AI attendance assistant. Let me show you what I can help with."
            features = [
                "Quick Log: One-click buttons to log In-Office, WFH, Annual Leave, or Sick Leave",
                "Natural Language: Just tell me 'I was in office Monday and Tuesday' and I'll log it",
                "Smart Tracking: I calculate your attendance as (Work Days - Leave Days) / Total Work Days",
                "Target Setting: Set office attendance goals and I'll track your progress",
                "Suggestions: I'll remind you to log attendance and spot patterns in your schedule",
            ]
            quick_tip = "Start by logging today's attendance using the quick buttons above!"
        else:
            # Returning user - provide contextual help
            greeting = f"Hello, {first_name}! Ready to track your attendance today?"
            features = [
                "Use quick buttons for one-click logging",
                "Type naturally to log multiple days at once",
                "Check your attendance stats in the summary cards",
                "Set targets to track your office attendance goals",
            ]
            quick_tip = "Tip: You can say things like 'I was WFH yesterday and sick on Monday'"

        return {
            "greeting": greeting,
            "features": features,
            "quick_tip": quick_tip,
        }

    async def generate_suggestions(
        self,
        user_id: int,
        db: AsyncSession,
    ) -> List[dict]:
        """Generate suggestions based on user's attendance patterns."""
        suggestions = []

        # Get recent attendance logs
        week_ago = date.today() - timedelta(days=7)
        result = await db.execute(
            select(AttendanceLog).where(
                and_(
                    AttendanceLog.user_id == user_id,
                    AttendanceLog.date >= week_ago,
                )
            ).order_by(AttendanceLog.date.desc())
        )
        recent_logs = result.scalars().all()

        # Check if today is logged
        today = date.today()
        today_logged = any(log.date == today for log in recent_logs)

        if not today_logged and today.weekday() < 5:  # Weekday
            suggestions.append({
                "type": "reminder",
                "message": "Don't forget to log your attendance for today!",
                "priority": 1,
            })

        # Check for gaps in recent days
        if recent_logs:
            logged_dates = {log.date for log in recent_logs}
            current = today - timedelta(days=1)
            gap_days = 0
            while current >= week_ago:
                if current.weekday() < 5 and current not in logged_dates:
                    gap_days += 1
                current -= timedelta(days=1)

            if gap_days > 0:
                suggestions.append({
                    "type": "warning",
                    "message": f"You have {gap_days} unlogged workday(s) in the past week.",
                    "priority": 2,
                })

        # Pattern-based suggestion
        if len(recent_logs) >= 3:
            office_days = [log.date.weekday() for log in recent_logs if log.status == AttendanceStatus.IN_OFFICE]
            if office_days:
                # Find most common office day
                from collections import Counter
                common_day = Counter(office_days).most_common(1)[0][0]
                day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
                if today.weekday() == common_day and not today_logged:
                    suggestions.append({
                        "type": "recommendation",
                        "message": f"You often go to office on {day_names[common_day]}s. Planning to go today?",
                        "priority": 3,
                    })

        return suggestions
