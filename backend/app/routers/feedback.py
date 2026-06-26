"""Post-event feedback / testimonials — never forced.

A subtle ask on the recap screen: a 1-5 rating plus an optional free-text
testimonial. One row per attendee per event — resubmitting updates it rather
than duplicating, so someone who changes their mind before navigating away
isn't blocked. No organizer-facing read endpoint by design: the team reviews
responses directly in Supabase for now (see migration 024).
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, fetch_my_attendee, get_current_user
from app.models.schemas import FeedbackCreate, FeedbackResponse, MyFeedbackResponse

router = APIRouter(prefix="/events/{event_id}/feedback", tags=["feedback"])


def _me_or_404(db: Client, event_id: str, user: AuthUser) -> dict:
    fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    return me


@router.post("", response_model=FeedbackResponse, status_code=201)
def submit_feedback(
    event_id: str,
    body: FeedbackCreate,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    me = _me_or_404(db, event_id, user)
    row = {
        "event_id": event_id,
        "attendee_id": str(me["id"]),
        "rating": body.rating,
        "comment": body.comment,
    }
    existing = (
        db.table("event_feedback")
        .select("id")
        .eq("event_id", event_id)
        .eq("attendee_id", str(me["id"]))
        .limit(1)
        .execute()
    )
    if existing.data:
        db.table("event_feedback").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        db.table("event_feedback").insert(row).execute()
    return FeedbackResponse(rating=body.rating, comment=body.comment)


@router.get("/me", response_model=MyFeedbackResponse)
def my_feedback(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Whether the caller already submitted feedback — the recap screen uses
    this to decide whether to show the card at all, across devices/sessions."""
    me = _me_or_404(db, event_id, user)
    rows = (
        db.table("event_feedback")
        .select("rating, comment")
        .eq("event_id", event_id)
        .eq("attendee_id", str(me["id"]))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return MyFeedbackResponse(submitted=False)
    return MyFeedbackResponse(submitted=True, rating=rows[0]["rating"], comment=rows[0].get("comment"))
