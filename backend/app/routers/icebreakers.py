from fastapi import APIRouter, HTTPException
from app.models.schemas import IcebreakerResponse
from app.database import supabase

router = APIRouter(prefix="/events/{event_id}/rounds/{round_id}/icebreaker", tags=["icebreakers"])


@router.get("/{attendee_id}", response_model=IcebreakerResponse)
async def get_icebreaker(event_id: str, round_id: str, attendee_id: str):
    result = (
        supabase.table("icebreakers")
        .select("*")
        .eq("round_id", round_id)
        .eq("recipient_attendee_id", attendee_id)
        .order("generated_at", desc=True)
        .limit(1)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Icebreaker not found")
    return result.data


@router.post("/{attendee_id}/refresh", response_model=IcebreakerResponse)
async def refresh_icebreaker(event_id: str, round_id: str, attendee_id: str):
    # Generates a new icebreaker via Claude API
    raise HTTPException(status_code=501, detail="Not implemented")
