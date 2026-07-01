"""Sponsors & event branding.

Sponsors are shown to attendees during the dead time between rounds (and in the
pre-event lobby), rotating around the hourglass. They're authored by the event
owner as a whole list (replace-on-save, like the round agenda) and delivered to
phones through THIS endpoint — not client-side table reads — so the sponsors
table stays service-role only.

The event's own logo + the show/hide toggle live on the events row (PATCH
/events/:id); they're returned here too so the attendee branding block needs a
single call.
"""

from fastapi import APIRouter, Depends
from supabase import Client

from app.audit import record_audit
from app.database import get_supabase
from app.deps import (
    AdminContext,
    fetch_event_or_404,
    get_current_admin_ctx,
    require_event_admin,
)
from app.models.schemas import SponsorItem, SponsorsPutRequest, SponsorsResponse

router = APIRouter(prefix="/events/{event_id}/sponsors", tags=["sponsors"])

_admin_ctx = get_current_admin_ctx

# Sane caps so a paste can't blow up a phone screen or the payload.
MAX_SPONSORS = 20
NAME_MAX = 80
TAGLINE_MAX = 160
URL_MAX = 2000


def _clean(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()[:limit]
    return trimmed or None


def _fetch_sponsors(db: Client, event_id: str) -> list[dict]:
    return (
        db.table("sponsors")
        .select("*")
        .eq("event_id", event_id)
        .order("display_order", desc=False)
        .execute()
        .data
        or []
    )


def _response(db: Client, event: dict) -> SponsorsResponse:
    rows = _fetch_sponsors(db, str(event["id"]))
    return SponsorsResponse(
        event_name=event["name"],
        logo_url=event.get("logo_url") or None,
        show_event_logo=bool(event.get("show_event_logo", True)),
        sponsors=[
            SponsorItem(
                id=r["id"],
                name=r["name"],
                image_url=r.get("image_url"),
                tagline=r.get("tagline"),
                url=r.get("url"),
            )
            for r in rows
        ],
    )


@router.get("", response_model=SponsorsResponse)
def get_sponsors(event_id: str, db: Client = Depends(get_supabase)):
    """Public — powers the attendee between-rounds / lobby branding. Sponsors are
    promotional by nature (meant to be seen), so no auth is required; nothing
    private is exposed."""
    event = fetch_event_or_404(db, event_id)
    return _response(db, event)


@router.put("", response_model=SponsorsResponse)
def replace_sponsors(
    event_id: str,
    body: SponsorsPutRequest,
    ctx: AdminContext = Depends(_admin_ctx),
    db: Client = Depends(get_supabase),
):
    """Replace the event's full sponsor list (owner only). Empty rows (no name and
    no image) are dropped; the list is capped and order is preserved."""
    event = fetch_event_or_404(db, event_id)
    require_event_admin(event, ctx)

    rows: list[dict] = []
    for i, s in enumerate(body.sponsors[:MAX_SPONSORS]):
        name = _clean(s.name, NAME_MAX)
        image_url = _clean(s.image_url, URL_MAX)
        if not name and not image_url:
            continue  # nothing to show — skip blank rows
        rows.append(
            {
                "event_id": event_id,
                "name": name or "Sponsor",
                "image_url": image_url,
                "tagline": _clean(s.tagline, TAGLINE_MAX),
                "url": _clean(s.url, URL_MAX),
                "display_order": len(rows),
            }
        )

    # Whole-list replace: clear, then insert the new set. Simple + predictable.
    db.table("sponsors").delete().eq("event_id", event_id).execute()
    if rows:
        db.table("sponsors").insert(rows).execute()

    record_audit(
        db,
        action="event.sponsors_updated",
        entity_type="event",
        actor_user_id=ctx.user_id,
        event_id=event_id,
        entity_id=event_id,
        metadata={"count": len(rows)},  # counts only, never the sponsor content
    )
    return _response(db, fetch_event_or_404(db, event_id))
