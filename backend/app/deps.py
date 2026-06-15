from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request
from supabase import Client

from app.database import get_supabase

ORGANIZER_ROLE = "organizer"


@dataclass
class AuthUser:
    """Authenticated Supabase user, resolved from a Bearer JWT."""

    id: str
    email: str | None
    role: str | None  # app_metadata.role — "organizer" or None (attendee)


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Client = Depends(get_supabase),
) -> AuthUser:
    """Verify the Supabase JWT from the Authorization header.

    Uses auth.get_user() (one round-trip) over local JWKS verification:
    reliability over cleverness at pilot scale. Swap internals here if
    request volume ever makes it matter — callers won't change.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        result = db.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if result is None or result.user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = result.user
    role = (user.app_metadata or {}).get("role")
    request.state.user_id = str(user.id)  # picked up by the request-log middleware
    return AuthUser(id=str(user.id), email=user.email, role=role)


async def get_optional_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Client = Depends(get_supabase),
) -> AuthUser | None:
    """Like get_current_user, but never raises — returns None when there's no
    valid token. For public endpoints that ENRICH their response when signed in
    (e.g. the events list annotating which ones you're registered for) but must
    still work for anonymous browsers.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return await get_current_user(request, authorization, db)
    except HTTPException:
        return None


async def get_current_organizer_id(
    user: AuthUser = Depends(get_current_user),
) -> str:
    """Organizer-only endpoints. Role is set via app_metadata (see scripts/tag_organizer.py)."""
    if user.role != ORGANIZER_ROLE:
        raise HTTPException(status_code=403, detail="Organizer access required")
    return user.id


def fetch_event_or_404(db: Client, event_id: str) -> dict:
    result = db.table("events").select("*").eq("id", event_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return result.data[0]


def require_event_owner(event: dict, organizer_id: str) -> None:
    if str(event["organizer_id"]) != str(organizer_id):
        raise HTTPException(status_code=403, detail="Not the organizer of this event")


def fetch_access_code(db: Client, event_id: str) -> str | None:
    """The event's secret registration code, or None if the event is open.

    Read with the service-role key only — event_access_codes has no RLS policies,
    so attendee phones can never reach this value.
    """
    result = (
        db.table("event_access_codes")
        .select("code")
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    return result.data[0]["code"] if result.data else None


def fetch_my_attendee(db: Client, event_id: str, user_id: str) -> dict | None:
    """The caller's own attendee row for this event, or None if not registered."""
    res = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def code_matches(required: str | None, supplied: str | None) -> bool:
    """True if `supplied` unlocks the gate. Open events (no code) always pass.

    Trimmed + case-insensitive, so 'mixer', ' MIXER ' and 'Mixer' all match.
    """
    required = (required or "").strip()
    if not required:
        return True
    return (supplied or "").strip().casefold() == required.casefold()
