from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
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
    db: Client = Depends(get_supabase),
):
    event = db.table("events").select("*").eq("id", event_id).limit(1).execute()
    if not event.data:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.data[0]["status"] == "ended":
        raise HTTPException(status_code=409, detail="Event has already ended")

    row = body.model_dump(mode="json")
    row["event_id"] = event_id
    row["status"] = "registered"
    row["user_id"] = None  # linked to auth identity in Step 3

    result = db.table("attendees").insert(row).execute()
    return result.data[0]


@router.get("/{attendee_id}", response_model=AttendeeWithAssignmentResponse)
async def get_attendee(
    event_id: str,
    attendee_id: str,
    db: Client = Depends(get_supabase),
):
    """Attendee profile + current table assignment (if a round is active)."""
    attendee = _fetch_attendee(db, event_id, attendee_id)
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
    db: Client = Depends(get_supabase),
):
    """Organizer control panel — mark attendee arrived / left."""
    attendee = _fetch_attendee(db, event_id, attendee_id)

    changes = body.model_dump(exclude_none=True)
    if not changes:
        return attendee

    result = db.table("attendees").update(changes).eq("id", attendee_id).execute()
    return result.data[0]
