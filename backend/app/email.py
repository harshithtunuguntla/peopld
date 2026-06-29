"""Outbound email — currently just the book-a-demo lead notification.

Deliberately tiny and best-effort: the lead is already persisted before this
runs, so a mail failure must never surface to the caller or lose data. When SMTP
isn't configured (no user/password) this is a no-op, so dev/test and any env
without creds simply skip the email and keep storing leads.
"""

import html
import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger("app.email")


def smtp_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send_connections_recap(to_email: str, event_name: str, people: list) -> None:
    """Email an attendee their post-event rolodex (name/role/company + links,
    matches first). Raises RuntimeError when SMTP isn't configured and re-raises
    send errors, so the (user-triggered) endpoint can report success/failure —
    unlike the fire-and-forget demo notification."""
    if not smtp_configured():
        raise RuntimeError("SMTP not configured")

    def line(p) -> str:
        bits = [getattr(p, "name", "") or "Someone"]
        role = " · ".join(b for b in [getattr(p, "role", None), getattr(p, "company", None)] if b)
        if role:
            bits.append(f"({role})")
        links = [u for u in [getattr(p, "linkedin_url", None), getattr(p, "website_url", None)] if u]
        if links:
            bits.append("— " + ", ".join(links))
        star = "★ " if getattr(p, "mutual", False) else "• "
        return star + " ".join(bits)

    text_lines = [f"Here's everyone you met at {event_name}:", ""]
    text_lines += [line(p) for p in people]
    text_lines += ["", "★ = you matched (you liked each other).", "", "— Peopld"]
    text = "\n".join(text_lines)

    def e(v) -> str:
        return html.escape(str(v)) if v else ""

    rows = "".join(
        f"<li style='margin:6px 0'>{'⭐ ' if getattr(p,'mutual',False) else ''}"
        f"<strong>{e(getattr(p,'name','')) or 'Someone'}</strong>"
        f"{(' — ' + ' · '.join(e(b) for b in [getattr(p,'role',None), getattr(p,'company',None)] if b)) if (getattr(p,'role',None) or getattr(p,'company',None)) else ''}"
        f"{(' · ' + e(getattr(p,'linkedin_url'))) if getattr(p,'linkedin_url',None) else ''}"
        f"</li>"
        for p in people
    )
    # NB: don't name this `html` — that would shadow the module-level `import html`
    # for this whole function scope and break `e()` (the closure above) with a
    # NameError when it runs before this assignment.
    html_body = (
        f"<div style='font-family:system-ui,sans-serif;max-width:560px'>"
        f"<h2>Your connections from {html.escape(event_name)}</h2>"
        f"<ul style='list-style:none;padding:0'>{rows}</ul>"
        f"<p style='color:#888;font-size:13px'>⭐ = you matched (you liked each other).</p>"
        f"<p style='color:#888;font-size:13px'>— Peopld</p></div>"
    )

    msg = EmailMessage()
    msg["Subject"] = f"Your connections from {event_name}"
    msg["From"] = settings.smtp_user
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
    logger.info("connections recap email sent")


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
