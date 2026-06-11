from fastapi import APIRouter, HTTPException
from app.database import supabase

router = APIRouter(prefix="/events/{event_id}/attendees/{attendee_id}/connections", tags=["connections"])


@router.get("")
async def get_connections(event_id: str, attendee_id: str):
    # Returns all people this attendee sat with, grouped by round
    # Used by the Digital Rolodex page
    raise HTTPException(status_code=501, detail="Not implemented")
