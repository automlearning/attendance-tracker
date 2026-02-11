from fastapi import APIRouter

from app.api.v1 import auth, users, attendance, targets, ai, admin, holidays, backup

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
api_router.include_router(targets.router, prefix="/targets", tags=["Targets"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI"])
api_router.include_router(holidays.router, prefix="/holidays", tags=["Holidays"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
api_router.include_router(backup.router, prefix="/backup", tags=["Backup"])
