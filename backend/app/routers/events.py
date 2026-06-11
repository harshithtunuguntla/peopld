from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import get_current_organizer_id
from app.models.schemas import (
    AttendeeResponse,
    EventAnalytics,
    EventCreate,
    EventResponse,
    EventUpdate,
)

router = APIRouter(prefix="/events", tags=["events"])


def _fetch_event(db: Client, event_id: str) -> dict:
    result = db.table("events").select("*").eq("id", event_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return result.data[0]


def _require_owner(event: dict, organizer_id: str) -> None:
    if str(event["organizer_id"]) != str(organizer_id):
        raise HTTPException(status_code=403, detail="Not the organizer of this event")


@router.get("/mine", response_model=list[EventResponse])
async def list_my_events(
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Organizer dashboard — all events created by the authenticated organizer."""
    result = (
        db.table("events")
        .select("*")
        .eq("organizer_id", organizer_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("", response_model=EventResponse, status_code=201)
async def create_event(
    body: EventCreate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    row = body.model_dump(mode="json")
    row["organizer_id"] = organizer_id
    row["status"] = "upcoming"
    result = db.table("events").insert(row).execute()
    return result.data[0]


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, db: Client = Depends(get_supabase)):
    """Public — powers the event landing page."""
    return _fetch_event(db, event_id)


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    body: EventUpdate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    event = _fetch_event(db, event_id)
    _require_owner(event, organizer_id)

    changes = body.model_dump(exclude_none=True)
    if not changes:
        return event

    result = db.table("events").update(changes).eq("id", event_id).execute()
    return result.data[0]


@router.post("/{event_id}/end", response_model=EventResponse)
async def end_event(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Ends the event and completes any round still active."""
    event = _fetch_event(db, event_id)
    _require_owner(event, organizer_id)

    now = datetime.now(timezone.utc).isoformat()
    db.table("rounds").update({"status": "completed", "ended_at": now}).eq(
        "event_id", event_id
    ).eq("status", "active").execute()

    result = db.table("events").update({"status": "ended"}).eq("id", event_id).execute()
    return result.data[0]


@router.get("/{event_id}/attendees", response_model=list[AttendeeResponse])
async def list_attendees(event_id: str, db: Client = Depends(get_supabase)):
    _fetch_event(db, event_id)
    result = db.table("attendees").select("*").eq("event_id", event_id).execute()
    return result.data or []


@router.get("/{event_id}/analytics", response_model=EventAnalytics)
async def get_analytics(event_id: str, db: Client = Depends(get_supabase)):
    """Post-event summary: attendee count, rounds completed, avg unique people met."""
    _fetch_event(db, event_id)

    attendees = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    rounds = db.table("rounds").select("*").eq("event_id", event_id).execute().data or []
    assignments = (
        db.table("table_assignments").select("*").eq("event_id", event_id).execute().data or []
    )

    rounds_completed = sum(1 for r in rounds if r["status"] == "completed")

    # Group assignments by (round, table), then collect each attendee's unique tablemates
    tables: dict[tuple, list] = {}
    for a in assignments:
        tables.setdefault((a["round_id"], a["table_number"]), []).append(a["attendee_id"])

    met: dict[str, set] = {}
    for group in tables.values():
        for attendee_id in group:
            met.setdefault(attendee_id, set()).update(
                other for other in group if other != attendee_id
            )

    avg_met = (
        round(sum(len(s) for s in met.values()) / len(met), 2) if met else 0.0
    )

    return EventAnalytics(
        total_attendees=len(attendees),
        rounds_completed=rounds_completed,
        avg_unique_people_met=avg_met,
    )
