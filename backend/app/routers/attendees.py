from fastapi import APIRouter, HTTPException
from app.models.schemas import AttendeeCreate, AttendeeUpdate, AttendeeWithAssignmentResponse, AttendeeResponse
from app.database import supabase

router = APIRouter(prefix="/events/{event_id}/attendees", tags=["attendees"])


@router.post("", response_model=AttendeeResponse, status_code=201)
async def register_attendee(event_id: str, body: AttendeeCreate):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{attendee_id}", response_model=AttendeeWithAssignmentResponse)
async def get_attendee(event_id: str, attendee_id: str):
    """Returns attendee profile + their current table assignment (if a round is active)."""
    attendee = (
        supabase.table("attendees")
        .select("*")
        .eq("id", attendee_id)
        .eq("event_id", event_id)
        .single()
        .execute()
    )
    if not attendee.data:
        raise HTTPException(status_code=404, detail="Attendee not found")

    result = dict(attendee.data)

    # Attach current assignment if an active round exists
    active_round = (
        supabase.table("rounds")
        .select("id, round_number")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if active_round.data:
        round_row = active_round.data[0]
        assignment = (
            supabase.table("table_assignments")
            .select("table_number")
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
async def update_attendee(event_id: str, attendee_id: str, body: AttendeeUpdate):
    raise HTTPException(status_code=501, detail="Not implemented")
