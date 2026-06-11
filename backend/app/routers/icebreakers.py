from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.models.schemas import IcebreakerResponse

router = APIRouter(
    prefix="/events/{event_id}/rounds/{round_id}/icebreaker",
    tags=["icebreakers"],
)


@router.get("/{attendee_id}", response_model=IcebreakerResponse)
async def get_icebreaker(
    event_id: str,
    round_id: str,
    attendee_id: str,
    db: Client = Depends(get_supabase),
):
    """Latest icebreaker generated for this attendee in this round."""
    result = (
        db.table("icebreakers")
        .select("*")
        .eq("round_id", round_id)
        .eq("recipient_attendee_id", attendee_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Icebreaker not found")
    return result.data[0]


@router.post("/{attendee_id}/refresh", response_model=IcebreakerResponse)
async def refresh_icebreaker(
    event_id: str,
    round_id: str,
    attendee_id: str,
    db: Client = Depends(get_supabase),
):
    # Step 6: generates a fresh icebreaker via the Claude API
    raise HTTPException(status_code=501, detail="Implemented in Step 6 (icebreaker engine)")
