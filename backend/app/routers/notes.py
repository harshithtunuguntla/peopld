"""Connection notes — a private one-liner an attendee jots about someone they met.

Notes are author-private, stored in the service-role-only `connection_notes`
table, and surfaced back to their author in the rolodex. Like likes, the author
is always resolved from the JWT — you can only ever write notes *as yourself*.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, fetch_my_attendee, get_current_user
from app.models.schemas import NoteRequest, NoteResponse

router = APIRouter(prefix="/events/{event_id}/notes", tags=["notes"])

MAX_NOTE_LEN = 500


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


@router.put("/{target_attendee_id}", response_model=NoteResponse)
async def upsert_note(
    event_id: str,
    target_attendee_id: str,
    body: NoteRequest,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Save (or replace) my private note about someone. Empty text clears it."""
    me = _me_or_404(db, event_id, user)
    if not _target_in_event(db, event_id, target_attendee_id):
        raise HTTPException(status_code=404, detail="Attendee not found")

    text = body.note.strip()[:MAX_NOTE_LEN]
    if not text:
        # An empty save means "remove the note" — keep PUT idempotent + simple.
        db.table("connection_notes").delete().eq("event_id", event_id).eq(
            "author_attendee_id", str(me["id"])
        ).eq("target_attendee_id", target_attendee_id).execute()
        return NoteResponse(target_attendee_id=target_attendee_id, note=None)

    existing = (
        db.table("connection_notes")
        .select("id")
        .eq("event_id", event_id)
        .eq("author_attendee_id", str(me["id"]))
        .eq("target_attendee_id", target_attendee_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        now = datetime.now(timezone.utc).isoformat()
        db.table("connection_notes").update({"note": text, "updated_at": now}).eq(
            "id", existing.data[0]["id"]
        ).execute()
    else:
        db.table("connection_notes").insert(
            {
                "event_id": event_id,
                "author_attendee_id": str(me["id"]),
                "target_attendee_id": target_attendee_id,
                "note": text,
            }
        ).execute()
    return NoteResponse(target_attendee_id=target_attendee_id, note=text)


@router.delete("/{target_attendee_id}", response_model=NoteResponse)
async def delete_note(
    event_id: str,
    target_attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Remove my note. Idempotent — deleting a note that never existed is fine."""
    me = _me_or_404(db, event_id, user)
    db.table("connection_notes").delete().eq("event_id", event_id).eq(
        "author_attendee_id", str(me["id"])
    ).eq("target_attendee_id", target_attendee_id).execute()
    return NoteResponse(target_attendee_id=target_attendee_id, note=None)
