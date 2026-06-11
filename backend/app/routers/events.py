from fastapi import APIRouter, HTTPException
from app.models.schemas import EventCreate, EventUpdate, EventResponse, EventAnalytics, AttendeeResponse
from app.database import supabase

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=201)
async def create_event(body: EventCreate):
    # TODO: get organizer_id from auth token
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str):
    result = supabase.table("events").select("*").eq("id", event_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return result.data


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(event_id: str, body: EventUpdate):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/{event_id}/end", response_model=EventResponse)
async def end_event(event_id: str):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{event_id}/attendees", response_model=list[AttendeeResponse])
async def list_attendees(event_id: str):
    result = supabase.table("attendees").select("*").eq("event_id", event_id).execute()
    return result.data or []


@router.get("/{event_id}/analytics", response_model=EventAnalytics)
async def get_analytics(event_id: str):
    raise HTTPException(status_code=501, detail="Not implemented")
