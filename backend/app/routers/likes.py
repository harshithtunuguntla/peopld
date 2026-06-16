"""Connection likes — an attendee "likes" a tablemate during a live round.

Likes are private signals stored in the service-role-only `connection_likes`
table. They surface later in the rolodex (a mutual like = a match). The liker is
always resolved from the JWT — you can only ever like *as yourself*.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, fetch_my_attendee, get_current_user
from app.models.schemas import LikeRequest, LikeResponse

router = APIRouter(prefix="/events/{event_id}/likes", tags=["likes"])


def _target_in_event(db: Client, event_id: str, target_id: str) -> bool:
    res = (
        db.table("attendees")
        .select("id")
        .eq("id", target_id)
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


@router.post("", response_model=LikeResponse, status_code=201)
def like_attendee(
    event_id: str,
    body: LikeRequest,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Like a tablemate. Idempotent — liking twice is a no-op (still 201/liked)."""
    fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Not registered for this event")

    target_id = str(body.target_attendee_id)
    if target_id == str(me["id"]):
        raise HTTPException(status_code=400, detail="You can't like yourself")
    if not _target_in_event(db, event_id, target_id):
        raise HTTPException(status_code=404, detail="Attendee not found")

    existing = (
        db.table("connection_likes")
        .select("id")
        .eq("event_id", event_id)
        .eq("liker_attendee_id", str(me["id"]))
        .eq("liked_attendee_id", target_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        db.table("connection_likes").insert(
            {
                "event_id": event_id,
                "liker_attendee_id": str(me["id"]),
                "liked_attendee_id": target_id,
            }
        ).execute()
    return LikeResponse(liked=True)


@router.delete("/{target_attendee_id}", response_model=LikeResponse)
def unlike_attendee(
    event_id: str,
    target_attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Remove a like. Idempotent — unliking something you never liked is fine."""
    fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Not registered for this event")

    db.table("connection_likes").delete().eq("event_id", event_id).eq(
        "liker_attendee_id", str(me["id"])
    ).eq("liked_attendee_id", target_attendee_id).execute()
    return LikeResponse(liked=False)
