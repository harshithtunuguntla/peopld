"""Organizer live announcements — push a short message to the whole room.

The organizer sends a one-line message ("Pizza's here", "Move to the patio for
round 3"); it's persisted and the realtime doorbell is rung so every connected
phone re-fetches /live and surfaces it (deduped by id). Reliability mirrors the
rest of the live path: persisted + repeated doorbell, so a briefly-offline phone
still catches the latest one when it returns. Owner-only.
"""

from fastapi import APIRouter, BackgroundTasks, Depends
from supabase import Client

from app.audit import record_audit
from app.database import get_supabase
from app.deps import (
    AdminContext,
    fetch_event_or_404,
    get_current_admin_ctx,
    require_event_admin,
)
from app.models.schemas import Announcement, AnnouncementCreate
from app.realtime import broadcast_event_changed

router = APIRouter(prefix="/events/{event_id}/announcements", tags=["announcements"])

_admin_ctx = get_current_admin_ctx


@router.post("", response_model=Announcement)
def create_announcement(
    event_id: str,
    body: AnnouncementCreate,
    background: BackgroundTasks,
    ctx: AdminContext = Depends(_admin_ctx),
    db: Client = Depends(get_supabase),
):
    """Owner-only. Persist the message and ring the doorbell so phones pick it up."""
    event = fetch_event_or_404(db, event_id)
    require_event_admin(event, ctx)

    created = (
        db.table("event_announcements")
        .insert({"event_id": event_id, "message": body.message})
        .execute()
    )
    row = created.data[0]

    # Ring the room (repeats on a spaced schedule, like every other live change).
    background.add_task(broadcast_event_changed, event_id, "announcement")
    record_audit(
        db,
        action="announcement.sent",
        entity_type="event_announcement",
        actor_user_id=ctx.user_id,
        event_id=event_id,
        entity_id=str(row["id"]),
        metadata={"length": len(body.message)},  # length only — never the text
    )
    return Announcement(id=row["id"], message=row["message"], created_at=row.get("created_at"))
