"""Email service using Resend."""
import resend
from app.config import settings


class EmailService:
    """Service for sending emails via Resend."""

    def __init__(self):
        if settings.RESEND_API_KEY:
            resend.api_key = settings.RESEND_API_KEY

    async def send_password_reset_email(self, to_email: str, reset_url: str, user_name: str) -> bool:
        """Send password reset email."""
        if not settings.RESEND_API_KEY:
            print(f"[DEV MODE] Password reset link for {to_email}: {reset_url}")
            return True

        try:
            resend.Emails.send({
                "from": settings.EMAIL_FROM,
                "to": [to_email],
                "subject": "Reset Your Password - Attendance Tracker",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p>Hi {user_name},</p>
                    <p>We received a request to reset your password for your Attendance Tracker account.</p>
                    <p>Click the button below to reset your password:</p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="{reset_url}"
                           style="background-color: #4F46E5; color: white; padding: 12px 24px;
                                  text-decoration: none; border-radius: 6px; display: inline-block;">
                            Reset Password
                        </a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #666;">{reset_url}</p>
                    <p>This link will expire in {settings.RESET_TOKEN_EXPIRE_HOURS} hours.</p>
                    <p>If you didn't request a password reset, you can safely ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">
                        Attendance Tracker - Your AI-powered attendance management tool
                    </p>
                </div>
                """,
            })
            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False
