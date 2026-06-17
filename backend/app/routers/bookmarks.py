"""Saved contacts — an attendee explicitly bookmarks people they met.

Bookmarks are a deliberate "keep this one" shortlist, SEPARATE from the auto
rolodex (everyone you sat with) and from the like signal. They're owner-private,
stored in the service-role-only `connection_bookmarks` table, and surfaced back
to their owner as the `saved` flag on each rolodex entry (for the "Saved" filter).
The owner is always resolved from the JWT — you can only ever save *as yourself*.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, fetch_my_attendee, get_current_user
from app.models.schemas import BookmarkResponse

router = APIRouter(prefix="/events/{event_id}/bookmarks", tags=["bookmarks"])


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


def _me_or_404(db: Client, event_id: str, user: AuthUser) -> dict:
    fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    return me


@router.put("/{target_attendee_id}", response_model=BookmarkResponse)
def save_contact(
    event_id: str,
    target_attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Save (bookmark) someone. Idempotent — saving twice is a no-op (still saved)."""
    me = _me_or_404(db, event_id, user)
    if target_attendee_id == str(me["id"]):
        raise HTTPException(status_code=400, detail="You can't save yourself")
    if not _target_in_event(db, event_id, target_attendee_id):
        raise HTTPException(status_code=404, detail="Attendee not found")

    existing = (
        db.table("connection_bookmarks")
        .select("id")
        .eq("event_id", event_id)
        .eq("owner_attendee_id", str(me["id"]))
        .eq("target_attendee_id", target_attendee_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        db.table("connection_bookmarks").insert(
            {
                "event_id": event_id,
                "owner_attendee_id": str(me["id"]),
                "target_attendee_id": target_attendee_id,
            }
        ).execute()
    return BookmarkResponse(target_attendee_id=target_attendee_id, saved=True)


@router.delete("/{target_attendee_id}", response_model=BookmarkResponse)
def unsave_contact(
    event_id: str,
    target_attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Remove a bookmark. Idempotent — unsaving something you never saved is fine."""
    me = _me_or_404(db, event_id, user)
    db.table("connection_bookmarks").delete().eq("event_id", event_id).eq(
        "owner_attendee_id", str(me["id"])
    ).eq("target_attendee_id", target_attendee_id).execute()
    return BookmarkResponse(target_attendee_id=target_attendee_id, saved=False)
