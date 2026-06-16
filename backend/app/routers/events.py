from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.audit import record_audit
from app.database import get_supabase
from app.deps import (
    AuthUser,
    code_matches,
    fetch_access_code,
    fetch_event_or_404,
    fetch_room_code,
    find_event_by_code,
    generate_access_code,
    generate_room_code,
    get_current_organizer_id,
    get_optional_user,
    require_event_owner,
)
from app.models.schemas import (
    AccessCodeResponse,
    AttendeeResponse,
    EventAnalytics,
    EventBrowseItem,
    EventCreate,
    EventResponse,
    EventStats,
    EventUpdate,
    JoinRequest,
    JoinResponse,
    LiveStats,
    RoomCodeResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
)

router = APIRouter(prefix="/events", tags=["events"])


def _attach_requires_code(db: Client, row: dict) -> dict:
    """Add the derived `requires_code` flag. The code value itself is never sent."""
    row["requires_code"] = fetch_access_code(db, str(row["id"])) is not None
    return row


def _attach_requires_code_bulk(db: Client, rows: list[dict]) -> list[dict]:
    if not rows:
        return rows
    ids = [str(r["id"]) for r in rows]
    coded = (
        db.table("event_access_codes").select("event_id").in_("event_id", ids).execute().data
        or []
    )
    coded_ids = {str(c["event_id"]) for c in coded}
    for r in rows:
        r["requires_code"] = str(r["id"]) in coded_ids
    return rows


def _upsert_access_code(db: Client, event_id: str, code: str | None) -> None:
    """Set, clear, or leave the gate. None = leave as-is; "" = clear; value = set."""
    if code is None:
        return
    code = code.strip()
    if not code:
        db.table("event_access_codes").delete().eq("event_id", event_id).execute()
    else:
        db.table("event_access_codes").upsert(
            {"event_id": event_id, "code": code}, on_conflict="event_id"
        ).execute()


@router.get("", response_model=list[EventBrowseItem])
def list_events(
    user: AuthUser | None = Depends(get_optional_user),
    db: Client = Depends(get_supabase),
):
    """Public attendee home feed — every event, soonest first, with non-PII
    social-proof counts and (when signed in) the caller's own registration state.

    PILOT SCOPE: lists all events. The pilot is one org / one event and the
    events row is already anon-readable, so a flat list is fine. MVP will scope
    this to invited / discoverable events per tenant — see PRODUCT.md.
    """
    rows = (
        db.table("events")
        .select("id,name,date,time,location,status")
        .order("date", desc=False)
        .execute()
        .data
        or []
    )
    if not rows:
        return []

    ids = [str(r["id"]) for r in rows]

    # Which events are gated (one query) — never expose the code itself.
    coded = (
        db.table("event_access_codes").select("event_id").in_("event_id", ids).execute().data
        or []
    )
    coded_ids = {str(c["event_id"]) for c in coded}

    # Social-proof counts (one query, tallied in Python — the pilot has a handful
    # of events; revisit with a grouped count if this list ever gets large).
    attendee_rows = (
        db.table("attendees").select("event_id").in_("event_id", ids).execute().data or []
    )
    counts: dict[str, int] = {}
    for a in attendee_rows:
        key = str(a["event_id"])
        counts[key] = counts.get(key, 0) + 1

    # The caller's own registrations — only when signed in (their state, not public).
    my_event_ids: set[str] = set()
    if user is not None:
        mine = (
            db.table("attendees")
            .select("event_id")
            .eq("user_id", user.id)
            .in_("event_id", ids)
            .execute()
            .data
            or []
        )
        my_event_ids = {str(m["event_id"]) for m in mine}

    return [
        EventBrowseItem(
            id=r["id"],
            name=r["name"],
            date=r["date"],
            time=r["time"],
            location=r["location"],
            status=r["status"],
            requires_code=str(r["id"]) in coded_ids,
            attendee_count=counts.get(str(r["id"]), 0),
            registered=str(r["id"]) in my_event_ids,
        )
        for r in rows
    ]


@router.get("/mine", response_model=list[EventResponse])
def list_my_events(
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Organizer dashboard - all events created by the authenticated organizer."""
    result = (
        db.table("events")
        .select("*")
        .eq("organizer_id", organizer_id)
        .order("created_at", desc=True)
        .execute()
    )
    return _attach_requires_code_bulk(db, result.data or [])


@router.post("", response_model=EventResponse, status_code=201)
def create_event(
    body: EventCreate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    row = body.model_dump(mode="json")
    access_code = row.pop("access_code", None)  # secret — lives in its own table
    row["organizer_id"] = organizer_id
    row["status"] = "upcoming"
    result = db.table("events").insert(row).execute()
    created = result.data[0]
    _upsert_access_code(db, created["id"], access_code)
    record_audit(
        db,
        action="event.created",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=created["id"],
        entity_id=created["id"],
    )
    return _attach_requires_code(db, created)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str, db: Client = Depends(get_supabase)):
    """Public - powers the event landing + registration page.

    Returns only `requires_code` (boolean); the code value itself never leaves
    the backend.
    """
    return _attach_requires_code(db, fetch_event_or_404(db, event_id))


@router.get("/{event_id}/stats", response_model=EventStats)
def get_event_stats(event_id: str, db: Client = Depends(get_supabase)):
    """Public, non-PII social proof for the registration page ('38 already inside').

    Returns a COUNT only — never names or contact info. The attendees table
    stays unreadable to clients; this count is computed server-side.
    """
    fetch_event_or_404(db, event_id)
    result = (
        db.table("attendees")
        .select("id", count="exact")
        .eq("event_id", event_id)
        .execute()
    )
    return EventStats(attendee_count=result.count or 0)


@router.post("/{event_id}/verify-code", response_model=VerifyCodeResponse)
def verify_event_code(
    event_id: str,
    body: VerifyCodeRequest,
    db: Client = Depends(get_supabase),
):
    """Public pre-check so the form can unlock before submit. Open events (no
    code) always return valid. The real enforcement is on POST /attendees —
    this is a UX convenience, not the security boundary.
    """
    fetch_event_or_404(db, event_id)
    return VerifyCodeResponse(valid=code_matches(fetch_access_code(db, event_id), body.code))


@router.post("/join", response_model=JoinResponse)
def join_by_code(
    body: JoinRequest,
    _user: AuthUser | None = Depends(get_optional_user),
    db: Client = Depends(get_supabase),
):
    """Reverse code -> event lookup for the join hub (code/QR). The attendee
    knows a code, not an event id; this resolves it so the client can route to
    the event's registration / waiting room. 404 when nothing matches.
    """
    event_id = find_event_by_code(db, body.code)
    if not event_id:
        raise HTTPException(status_code=404, detail="No event matches that code")
    event = fetch_event_or_404(db, event_id)
    return JoinResponse(event_id=event["id"], name=event["name"], requires_code=True)


@router.patch("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: str,
    body: EventUpdate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

    changes = body.model_dump(mode="json", exclude_none=True)
    # access_code is a secret in its own table — pull it out of the events update.
    access_code = changes.pop("access_code", None)
    if access_code is not None:
        _upsert_access_code(db, event_id, access_code)

    if not changes:
        return _attach_requires_code(db, fetch_event_or_404(db, event_id))

    result = db.table("events").update(changes).eq("id", event_id).execute()
    record_audit(
        db,
        action="event.updated",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
        # status/config values only. access_code is logged as a boolean — never the value.
        metadata={"changes": changes, "access_code_changed": access_code is not None},
    )
    return _attach_requires_code(db, result.data[0])


@router.post("/{event_id}/end", response_model=EventResponse)
def end_event(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Ends the event and completes any round still active."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

    now = datetime.now(timezone.utc).isoformat()
    db.table("rounds").update({"status": "completed", "ended_at": now}).eq(
        "event_id", event_id
    ).eq("status", "active").execute()

    result = db.table("events").update({"status": "ended"}).eq("id", event_id).execute()
    record_audit(
        db,
        action="event.ended",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
    )
    return _attach_requires_code(db, result.data[0])


@router.get("/{event_id}/access-code", response_model=AccessCodeResponse)
def get_access_code(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """The event's secret code, returned ONLY to the owning organizer so they can
    read it aloud / show the QR. Attendee phones can never reach this value."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    return AccessCodeResponse(code=fetch_access_code(db, event_id))


@router.post("/{event_id}/access-code/regenerate", response_model=AccessCodeResponse)
def regenerate_access_code(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Mint a fresh, unique code for the event (owner only). Old code stops working."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    code = generate_access_code(db)
    _upsert_access_code(db, event_id, code)
    record_audit(
        db,
        action="event.code_regenerated",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
        # never log the code value itself
    )
    return AccessCodeResponse(code=code)


@router.delete("/{event_id}/access-code", response_model=AccessCodeResponse)
def clear_access_code(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Remove the code — the event becomes open (link/QR is the only gate)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    _upsert_access_code(db, event_id, "")  # "" clears the row
    record_audit(
        db,
        action="event.code_cleared",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
    )
    return AccessCodeResponse(code=None)


# --- Room code (Phase 2 — self-service day-of check-in) ---
# A SECOND secret, separate from the access code above. Owner-only at every step;
# the value is revealed only in the control room and never goes in a link/QR.


@router.get("/{event_id}/room-code", response_model=RoomCodeResponse)
def get_room_code(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """The event's room code, returned ONLY to the owning organizer so they can
    reveal it in the room. None until they open check-in. Attendee phones can
    never reach this value (service-role-only table)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    return RoomCodeResponse(code=fetch_room_code(db, event_id))


@router.post("/{event_id}/room-code/regenerate", response_model=RoomCodeResponse)
def regenerate_room_code(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Open check-in / mint a fresh room code (owner only). Doubles as the first
    'generate' when none exists. Any previously shown code stops working."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    code = generate_room_code()
    db.table("event_room_codes").upsert(
        {"event_id": event_id, "code": code}, on_conflict="event_id"
    ).execute()
    record_audit(
        db,
        action="event.room_code_regenerated",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
        # never log the code value itself
    )
    return RoomCodeResponse(code=code)


@router.delete("/{event_id}/room-code", response_model=RoomCodeResponse)
def clear_room_code(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Close check-in — no one can self-arrive until a new code is opened (owner only)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    db.table("event_room_codes").delete().eq("event_id", event_id).execute()
    record_audit(
        db,
        action="event.room_code_cleared",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
    )
    return RoomCodeResponse(code=None)


@router.get("/{event_id}/attendees", response_model=list[AttendeeResponse])
def list_attendees(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Full attendee list (includes contact info) — event owner only."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    result = db.table("attendees").select("*").eq("event_id", event_id).execute()
    return result.data or []


def _likes_and_matches(db: Client, event_id: str) -> tuple[int, int]:
    """(total likes cast, total mutual matches). A match is counted once per pair."""
    likes = (
        db.table("connection_likes")
        .select("liker_attendee_id, liked_attendee_id")
        .eq("event_id", event_id)
        .execute()
        .data
        or []
    )
    directed = {(str(l["liker_attendee_id"]), str(l["liked_attendee_id"])) for l in likes}
    matches = sum(1 for a, b in directed if a < b and (b, a) in directed)
    return len(directed), matches


@router.get("/{event_id}/analytics", response_model=EventAnalytics)
def get_analytics(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Post-event summary: attendee count, rounds completed, avg unique people met.

    Organizer dashboard feature — attendees get their own numbers from the
    connections endpoint instead.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

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

    total_likes, total_matches = _likes_and_matches(db, event_id)

    return EventAnalytics(
        total_attendees=len(attendees),
        rounds_completed=rounds_completed,
        avg_unique_people_met=avg_met,
        total_likes=total_likes,
        total_matches=total_matches,
    )


@router.get("/{event_id}/live-stats", response_model=LiveStats)
def get_live_stats(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Organizer "room pulse" — the live numbers the control room polls during an
    event: who's here, who's seated this round, and how the connections are
    flowing. Event owner only."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

    attendees = db.table("attendees").select("status").eq("event_id", event_id).execute().data or []
    registered = len(attendees)
    arrived = sum(1 for a in attendees if a["status"] == "arrived")

    active = (
        db.table("rounds")
        .select("id, round_number")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
    )
    seated_now = 0
    active_round_number = None
    if active:
        active_round_number = active[0]["round_number"]
        seats = (
            db.table("table_assignments")
            .select("id")
            .eq("round_id", active[0]["id"])
            .execute()
            .data
            or []
        )
        seated_now = len(seats)

    total_likes, total_matches = _likes_and_matches(db, event_id)

    return LiveStats(
        registered=registered,
        arrived=arrived,
        seated_now=seated_now,
        not_seated=max(arrived - seated_now, 0),
        likes_count=total_likes,
        matches_count=total_matches,
        active_round_number=active_round_number,
    )
