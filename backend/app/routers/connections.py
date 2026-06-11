from fastapi import APIRouter, HTTPException
from app.models.schemas import ConnectionsResponse
from app.database import supabase

router = APIRouter(prefix="/events/{event_id}/attendees/{attendee_id}/connections", tags=["connections"])


@router.get("", response_model=ConnectionsResponse)
async def get_connections(event_id: str, attendee_id: str):
    """Digital Rolodex — returns everyone this attendee sat with, grouped by round."""
    raise HTTPException(status_code=501, detail="Not implemented")
