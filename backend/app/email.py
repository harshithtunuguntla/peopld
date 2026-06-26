"""Outbound email — currently just the book-a-demo lead notification.

Deliberately tiny and best-effort: the lead is already persisted before this
runs, so a mail failure must never surface to the caller or lose data. When SMTP
isn't configured (no user/password) this is a no-op, so dev/test and any env
without creds simply skip the email and keep storing leads.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger("app.email")


def smtp_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send_demo_notification(lead: dict) -> None:
    """Email a new demo request to the team. Best-effort: logs and returns on any
    problem, never raises. Safe to run as a FastAPI BackgroundTask."""
    if not smtp_configured():
        logger.info("demo email skipped (SMTP not configured)")
        return

    try:
        msg = EmailMessage()
        msg["Subject"] = f"New demo request — {lead.get('name') or 'someone'}"
        msg["From"] = settings.smtp_user
        msg["To"] = settings.demo_notify_email
        if lead.get("email"):
            msg["Reply-To"] = lead["email"]
        body = (
            "New book-a-demo lead from the Peopld site:\n\n"
            f"Name:    {lead.get('name', '')}\n"
            f"Email:   {lead.get('email', '')}\n"
            f"Company: {lead.get('company') or '—'}\n\n"
            f"Message:\n{lead.get('message') or '—'}\n"
        )
        msg.set_content(body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info("demo email sent")
    except Exception:
        # Lead is already saved — a mail hiccup is non-fatal.
        logger.exception("demo email failed to send")
