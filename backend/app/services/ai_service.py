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
Current year: {current_year}

User input: "{user_input}"

Rules:
1. Valid statuses: "in_office", "wfh", "wfh_exempt", "annual_leave", "sick_leave"
2. Interpret relative dates (yesterday, last Monday, etc.) based on current date
3. Handle date ranges (Jan 15-17, Monday to Wednesday)
4. Default to "in_office" if status is ambiguous but location/office/work mentioned
5. Only include workdays (Monday-Friday) unless explicitly stated otherwise
6. For leave/vacation/holiday/PTO/time off -> use "annual_leave"
7. For sick/ill/unwell/doctor -> use "sick_leave"
8. For approved/exempt/discretionary WFH -> use "wfh_exempt"

IMPORTANT - Week calculations:
- "First week" = days 1-7 of the month
- "Second week" = days 8-14 of the month
- "Third week" = days 15-21 of the month
- "Fourth week" = days 22-28 of the month
- "Fifth week" or "last days" = days 29-31 (if they exist)

When user says "every Monday in first week of March", find the Monday(s) that fall between March 1-7.
When user says "Monday, Wednesday, Friday in weeks 1 and 3", find those days in both week ranges.

For month names without a year, use {current_year}. If the month has already passed this year, use the next occurrence.

Example 1: "every Monday in March" -> all Mondays in March {current_year}
Example 2: "Mon/Wed/Fri in first and third week of March" -> find Mon/Wed/Fri in March 1-7 AND March 15-21

Respond with ONLY a valid JSON array of objects with "date" (YYYY-MM-DD format) and "status" fields.
If the input is unclear or invalid, respond with an empty array [].

Example response:
[{{"date": "2026-03-02", "status": "in_office"}}, {{"date": "2026-03-04", "status": "in_office"}}, {{"date": "2026-03-06", "status": "in_office"}}]"""


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
            current_year=current_date.year,
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
        if "exempt" in text or "approved wfh" in text or "discretionary" in text:
            status = AttendanceStatus.WFH_EXEMPT
        elif "wfh" in text or "work from home" in text or "remote" in text:
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
            greeting = f"Welcome, {first_name}! I'm your AI attendance assistant. I'll help you meet your 50% office attendance target."
            features = [
                "Your target: 50% office attendance (about 5 days per fortnight)",
                "How it works: Office % = Office Days ÷ Work Days (excludes leave and public holidays)",
                "Quick Log: One-click buttons to log In-Office, WFH, Leave, or use WFH Exempt for approved exceptions",
                "AI Assistant: I'll tell you if you're on track and what to do to meet your target",
                "Natural Language: Just tell me 'I was in office Monday and Tuesday' and I'll log it",
            ]
            quick_tip = "Start by logging today's attendance - I'll track your progress toward 50%!"
        else:
            # Returning user - provide contextual help
            greeting = f"Hello, {first_name}! Let's check your progress toward 50% office attendance."
            features = [
                "Check the insights card below for personalized advice",
                "Use quick buttons or type naturally to log attendance",
                "WFH Exempt days don't count against your target",
            ]
            quick_tip = "Tip: The insights card shows exactly how many office days you need this month"

        return {
            "greeting": greeting,
            "features": features,
            "quick_tip": quick_tip,
        }

    async def generate_intro_insights(
        self,
        user_id: int,
        user_name: str,
        target_percentage: float,
        db: AsyncSession,
    ) -> dict:
        """Generate personalized introduction content for first-time users."""
        first_name = user_name.split()[0] if user_name else "there"

        # Check if user has any attendance logs
        result = await db.execute(
            select(AttendanceLog).where(AttendanceLog.user_id == user_id).limit(1)
        )
        has_logs = result.scalar_one_or_none() is not None

        # Base welcome message
        welcome_message = f"Welcome to Attendance Tracker, {first_name}! I'm your AI attendance assistant, here to help you track your office attendance and meet your {target_percentage}% target."

        # Generate insights based on whether user has data
        if not has_logs:
            # New user - provide onboarding insights
            key_insights = [
                f"Your target is {target_percentage}% office attendance",
                "Office % = Office Days ÷ Work Days (excludes leave and public holidays)",
                "Use quick-log buttons or natural language to track your attendance",
                "I'll provide personalized assistance to help you stay on track",
            ]
            action_items = [
                "Start by logging today's attendance",
                "Check the insights card for personalized information",
                "Ask me questions anytime - I'm here to help!",
            ]
        else:
            # User has logs - get current stats
            from datetime import date
            from calendar import monthrange

            today = date.today()
            month_start = today.replace(day=1)
            _, last_day = monthrange(today.year, today.month)
            month_end = today.replace(day=last_day)

            # Get attendance logs for current month
            logs_result = await db.execute(
                select(AttendanceLog).where(
                    and_(
                        AttendanceLog.user_id == user_id,
                        AttendanceLog.date >= month_start,
                        AttendanceLog.date <= month_end,
                    )
                )
            )
            logs = logs_result.scalars().all()

            # Calculate stats
            office_days = sum(1 for log in logs if log.status == AttendanceStatus.IN_OFFICE)
            wfh_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH)
            leave_days = sum(1 for log in logs if log.status in [AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.SICK_LEAVE])
            exempt_days = sum(1 for log in logs if log.status == AttendanceStatus.WFH_EXEMPT)

            # Count business days
            business_days = 0
            current = month_start
            while current <= today:
                if current.weekday() < 5:
                    business_days += 1
                current += timedelta(days=1)

            work_days = business_days - leave_days - exempt_days
            current_percentage = (office_days / work_days * 100) if work_days > 0 else 0

            # Calculate days needed
            target_office_days = int((target_percentage / 100) * work_days)
            days_needed = max(0, target_office_days - office_days)

            # Use Claude API to generate personalized insights if available
            if self.client:
                try:
                    prompt = f"""Generate a personalized welcome message and insights for a user returning to the attendance tracker.

User Context:
- Name: {first_name}
- Target: {target_percentage}%
- Current percentage: {current_percentage:.1f}%
- Office days so far: {office_days}
- Days needed to meet target: {days_needed}
- Work days this month: {work_days}

Generate:
1. A warm welcome message (1-2 sentences)
2. 3-4 key insights as bullet points about their attendance
3. 2-3 action items they should take

Format as JSON with keys: welcome_message, key_insights (array), action_items (array)"""

                    response = self.client.messages.create(
                        model=self.model,
                        max_tokens=512,
                        messages=[{"role": "user", "content": prompt}],
                    )

                    import json
                    result = json.loads(response.content[0].text.strip())
                    return result
                except Exception:
                    pass  # Fall through to fallback

            # Fallback insights
            if current_percentage >= target_percentage:
                status = f"You're doing great! At {current_percentage:.1f}%, you're already meeting your {target_percentage}% target"
            elif days_needed > 0:
                status = f"You're at {current_percentage:.1f}% with {days_needed} more office day(s) needed to reach {target_percentage}%"
            else:
                status = f"You're at {current_percentage:.1f}% office attendance so far"

            key_insights = [
                status,
                f"{office_days} office days logged this month",
                "Use the dashboard to plan ahead and stay on track",
                "I can answer questions about your progress anytime",
            ]
            action_items = [
                "Check the insights card for detailed information",
                "Log today's attendance if you haven't already",
                "Ask me for tips on meeting your target",
            ]

        return {
            "greeting": welcome_message,
            "insights": key_insights,
            "action_items": action_items,
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

    async def chat(
        self,
        message: str,
        context: dict,
    ) -> str:
        """Chat with the AI about attendance, targets, and tips."""

        system_prompt = f"""You are a friendly AI attendance assistant helping users meet their office attendance target.

Current user context:
- Name: {context.get('user_name', 'User')}
- Target: {context.get('target_percentage', 50)}% office attendance
- Current percentage: {context.get('current_percentage', 0)}% (based on actual office days so far)
- Actual office days (already occurred): {context.get('office_days', 0)}
- Planned office days (future): {context.get('planned_office_days', 0)}
- WFH days: {context.get('wfh_days', 0)}
- Leave days: {context.get('leave_days', 0)}
- WFH Exempt days: {context.get('exempt_days', 0)}
- Total business days this month: {context.get('business_days', 0)}
- Work days (business days - leave - exempt): {context.get('work_days', 0)}
- Remaining business days: {context.get('remaining_days', 0)}
- Target office days needed: {context.get('target_office_days', 0)}
- Additional office days still needed: {context.get('days_needed', 0)}
- Projected percentage if plans kept: {context.get('projected_percentage', 0)}%

How the calculation works:
- Office % = Office Days ÷ Work Days
- Work Days = Business Days - Leave Days - WFH Exempt Days
- This means leave and WFH exempt days don't count against you
- Each month starts fresh at 0%

Guidelines:
1. Be friendly, supportive, and encouraging
2. Give specific, actionable advice based on their actual numbers
3. Keep responses concise (2-4 sentences usually)
4. If they're on track, celebrate! If behind, be supportive not judgmental
5. Consider both actual AND planned office days when giving advice
6. If they have planned office days, mention them positively
7. Each month starts fresh - no carryover from previous months

Help the user understand their progress and give practical tips for meeting their target."""

        if not self.client:
            # Fallback response without AI
            pct = context.get('current_percentage', 0)
            projected = context.get('projected_percentage', 0)
            target = context.get('target_percentage', 50)
            needed = context.get('days_needed', 0)
            remaining = context.get('remaining_days', 0)
            planned = context.get('planned_office_days', 0)
            office = context.get('office_days', 0)
            work_days = context.get('work_days', 1)

            if projected >= target:
                if planned > 0:
                    return f"You're doing great! At {pct}% actual with {planned} day(s) planned, you'll reach {projected}% - above your {target}% target!"
                return f"You're doing great! At {pct}%, you've already hit your {target}% target. Keep it up!"
            elif needed <= remaining:
                planned_msg = f" (with {planned} already planned)" if planned > 0 else ""
                return f"You're at {pct}%{planned_msg} and need {needed} more office day(s) to reach {target}%. You have {remaining} business days left - totally achievable!"
            else:
                max_pct = ((office + planned + remaining) / work_days * 100) if work_days > 0 else 0
                return f"You're at {pct}% with {remaining} days left. Even going to office every remaining day, you'd reach {max_pct:.0f}%. Focus on maximizing office days and plan better for next month."

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=512,
                system=system_prompt,
                messages=[{"role": "user", "content": message}],
            )
            return response.content[0].text.strip()
        except Exception as e:
            # Fallback on error
            return f"I'm having trouble connecting right now. Your current stats: {context.get('current_percentage', 0)}% office attendance ({context.get('office_days', 0)} days). Target: {context.get('target_percentage', 50)}%."
