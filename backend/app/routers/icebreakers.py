from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, get_current_user
from app.icebreakers import engine
from app.models.schemas import IcebreakerResponse

router = APIRouter(
    prefix="/events/{event_id}/rounds/{round_id}/icebreaker",
    tags=["icebreakers"],
)


def _require_self_or_organizer(
    db: Client, event_id: str, attendee_id: str, user: AuthUser
) -> None:
    """Icebreakers are personalized (will reference tablemates by name from
    Step 6), so only the recipient or the event organizer may read them."""
    event = fetch_event_or_404(db, event_id)
    attendee = (
        db.table("attendees")
        .select("*")
        .eq("id", attendee_id)
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    if not attendee.data:
        raise HTTPException(status_code=404, detail="Attendee not found")

    is_organizer = str(event["organizer_id"]) == user.id
    is_self = (
        attendee.data[0].get("user_id") is not None
        and str(attendee.data[0]["user_id"]) == user.id
    )
    if not (is_organizer or is_self):
        raise HTTPException(status_code=403, detail="Not allowed to view this icebreaker")


@router.get("/{attendee_id}", response_model=IcebreakerResponse)
def get_icebreaker(
    event_id: str,
    round_id: str,
    attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Latest icebreaker generated for this attendee in this round."""
    _require_self_or_organizer(db, event_id, attendee_id, user)
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
def refresh_icebreaker(
    event_id: str,
    round_id: str,
    attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Generate a fresh icebreaker for this attendee's current table (synchronous —
    the button waits for the new question). Falls back to a curated one if the LLM
    is unavailable, so the tap always produces something."""
    _require_self_or_organizer(db, event_id, attendee_id, user)
    icebreaker = engine.refresh_for_attendee(db, event_id, round_id, attendee_id)
    if icebreaker is None:
        raise HTTPException(
            status_code=409, detail="This attendee is not seated in this round"
        )
    return icebreaker
