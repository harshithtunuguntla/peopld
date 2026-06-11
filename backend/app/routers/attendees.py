from fastapi import APIRouter, HTTPException
from app.models.schemas import AttendeeCreate, AttendeeUpdate, AttendeeResponse
from app.database import supabase

router = APIRouter(prefix="/events/{event_id}/attendees", tags=["attendees"])


@router.post("", response_model=AttendeeResponse, status_code=201)
async def register_attendee(event_id: str, body: AttendeeCreate):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{attendee_id}", response_model=AttendeeResponse)
async def get_attendee(event_id: str, attendee_id: str):
    result = (
        supabase.table("attendees")
        .select("*")
        .eq("id", attendee_id)
        .eq("event_id", event_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return result.data


@router.patch("/{attendee_id}", response_model=AttendeeResponse)
async def update_attendee(event_id: str, attendee_id: str, body: AttendeeUpdate):
    raise HTTPException(status_code=501, detail="Not implemented")
