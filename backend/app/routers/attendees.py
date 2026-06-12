from fastapi import APIRouter, Depends, HTTPException, Response
from supabase import Client

from app.database import get_supabase
from app.deps import (
    AuthUser,
    fetch_event_or_404,
    get_current_organizer_id,
    get_current_user,
    require_event_owner,
)
from app.models.schemas import (
    AttendeeCreate,
    AttendeeResponse,
    AttendeeUpdate,
    AttendeeWithAssignmentResponse,
)

router = APIRouter(prefix="/events/{event_id}/attendees", tags=["attendees"])


def _fetch_attendee(db: Client, event_id: str, attendee_id: str) -> dict:
    result = (
        db.table("attendees")
        .select("*")
        .eq("id", attendee_id)
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return result.data[0]


@router.post("", response_model=AttendeeResponse, status_code=201)
async def register_attendee(
    event_id: str,
    body: AttendeeCreate,
    response: Response,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    event = fetch_event_or_404(db, event_id)

    # Dedupe: one registration per auth identity per event. Re-registering
    # returns the existing record (200, not 201) — even after the event ends,
    # so returning attendees can still reach their rolodex.
    existing = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if existing.data:
        response.status_code = 200
        return existing.data[0]

    if event["status"] == "ended":
        raise HTTPException(status_code=409, detail="Event has already ended")

    row = body.model_dump(mode="json")
    row["event_id"] = event_id
    row["status"] = "registered"
    row["user_id"] = user.id

    result = db.table("attendees").insert(row).execute()
    return result.data[0]


@router.get("/me", response_model=AttendeeResponse)
async def get_my_registration(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The caller's own registration for this event, 404 if not registered.

    Lets the frontend detect an existing registration BEFORE showing the
    form. Declared before /{attendee_id} so 'me' isn't matched as an id.
    """
    fetch_event_or_404(db, event_id)
    result = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    return result.data[0]


@router.get("/{attendee_id}", response_model=AttendeeWithAssignmentResponse)
async def get_attendee(
    event_id: str,
    attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Attendee profile + current table assignment (if a round is active).

    Contains contact info, so restricted to the attendee themself or the
    event's organizer.
    """
    event = fetch_event_or_404(db, event_id)
    attendee = _fetch_attendee(db, event_id, attendee_id)

    is_organizer = str(event["organizer_id"]) == user.id
    is_self = attendee.get("user_id") is not None and str(attendee["user_id"]) == user.id
    if not (is_organizer or is_self):
        raise HTTPException(status_code=403, detail="Not allowed to view this attendee")

    result = dict(attendee)

    active_round = (
        db.table("rounds")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if active_round.data:
        round_row = active_round.data[0]
        assignment = (
            db.table("table_assignments")
            .select("*")
            .eq("round_id", round_row["id"])
            .eq("attendee_id", attendee_id)
            .limit(1)
            .execute()
        )
        if assignment.data:
            result["current_table_number"] = assignment.data[0]["table_number"]
            result["current_round_id"] = round_row["id"]
            result["current_round_number"] = round_row["round_number"]

    return result


@router.patch("/{attendee_id}", response_model=AttendeeResponse)
async def update_attendee(
    event_id: str,
    attendee_id: str,
    body: AttendeeUpdate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Organizer control panel — mark attendee arrived / left. Event owner only."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    attendee = _fetch_attendee(db, event_id, attendee_id)

    changes = body.model_dump(exclude_none=True)
    if not changes:
        return attendee

    result = db.table("attendees").update(changes).eq("id", attendee_id).execute()
    return result.data[0]
