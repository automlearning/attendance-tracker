from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.attendance import AttendanceStatus, AttendanceSource
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
