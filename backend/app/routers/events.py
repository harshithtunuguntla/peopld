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
    DashboardSummary,
    EventAnalytics,
    EventBrowseItem,
    EventCreate,
    EventResponse,
    EventStats,
    EventUpdate,
    GraphEdge,
    GraphNode,
    JoinRequest,
    JoinResponse,
    LiveStats,
    RoomCodeResponse,
    RoundPerf,
    TopConnector,
    VerifyCodeRequest,
    VerifyCodeResponse,
)

router = APIRouter(prefix="/events", tags=["events"])


def _attach_requires_code(db: Client, row: dict) -> dict:
    """Add the derived `requires_code` + `is_archived` flags. The access code value
    itself is never sent."""
    row["requires_code"] = fetch_access_code(db, str(row["id"])) is not None
    row["is_archived"] = bool(row.get("archived_at"))
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
        r["is_archived"] = bool(r.get("archived_at"))
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
        .select("id,name,date,time,location,status,archived_at")
        .order("date", desc=False)
        .execute()
        .data
        or []
    )
    # Archived events are hidden from the public attendee feed too (test/retired events).
    rows = [r for r in rows if not r.get("archived_at")]
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
    include_archived: bool = False,
):
    """Organizer dashboard - all events created by the authenticated organizer.

    Archived events are hidden by default (dashboard hygiene); pass
    ?include_archived=true to include them (so they can be unarchived).
    """
    result = (
        db.table("events")
        .select("*")
        .eq("organizer_id", organizer_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data or []
    if not include_archived:
        rows = [r for r in rows if not r.get("archived_at")]
    return _attach_requires_code_bulk(db, rows)


def _unique_table_pairs(assignments: list[dict]) -> set[frozenset]:
    """All unique pairs of people who shared a table in at least one round.
    Grouped by (round, table); a pair seen in two rounds counts once."""
    groups: dict[tuple, list] = {}
    for a in assignments:
        groups.setdefault((a["round_id"], a["table_number"]), []).append(str(a["attendee_id"]))
    pairs: set[frozenset] = set()
    for members in groups.values():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                pairs.add(frozenset((members[i], members[j])))
    return pairs


def _pair_round_numbers(
    assignments: list[dict], round_number_by_id: dict[str, int]
) -> dict[frozenset, list[int]]:
    """For every pair who shared a table, the sorted round numbers they met in.

    Unlike `_unique_table_pairs`, this PRESERVES repeat interactions — the basis
    for relationship strength/weights and the repeat-pairing intelligence. A pair
    seated together in rounds 1 and 3 yields [1, 3] (weight 2) instead of being
    collapsed to a single binary edge. This is the single source the graph,
    coverage, and relationship analytics all derive from."""
    groups: dict[tuple, list] = {}
    for a in assignments:
        groups.setdefault((a["round_id"], a["table_number"]), []).append(str(a["attendee_id"]))
    pairs: dict[frozenset, set] = {}
    for (round_id, _table), members in groups.items():
        rn = round_number_by_id.get(str(round_id))
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                pairs.setdefault(frozenset((members[i], members[j])), set()).add(rn)
    return {k: sorted(r for r in v if r is not None) for k, v in pairs.items()}


@router.get("/dashboard-summary", response_model=DashboardSummary)
def dashboard_summary(
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Honest, event-wide aggregates for the organizer dashboard bento — computed
    server-side in a handful of bulk queries (not per-event round-trips). Archived
    events are excluded so the headline numbers match the visible event list."""
    events = (
        db.table("events").select("id, status, archived_at").eq("organizer_id", organizer_id).execute().data
        or []
    )
    events = [e for e in events if not e.get("archived_at")]
    event_ids = [str(e["id"]) for e in events]

    summary = DashboardSummary(
        events_total=len(events),
        events_live=sum(1 for e in events if e["status"] == "active"),
        events_upcoming=sum(1 for e in events if e["status"] == "upcoming"),
        events_completed=sum(1 for e in events if e["status"] == "ended"),
        guests_total=0,
        connections_total=0,
        introductions_total=0,
    )
    if not event_ids:
        return summary

    attendees = (
        db.table("attendees").select("id, event_id").in_("event_id", event_ids).execute().data or []
    )
    assignments = (
        db.table("table_assignments")
        .select("event_id, round_id, table_number, attendee_id")
        .in_("event_id", event_ids)
        .execute()
        .data
        or []
    )
    likes = (
        db.table("connection_likes")
        .select("event_id, liker_attendee_id, liked_attendee_id")
        .in_("event_id", event_ids)
        .execute()
        .data
        or []
    )

    summary.guests_total = len(attendees)

    # Introductions = unique table pairs, computed per event then summed.
    by_event_assign: dict[str, list] = {}
    for a in assignments:
        by_event_assign.setdefault(str(a["event_id"]), []).append(a)
    summary.introductions_total = sum(
        len(_unique_table_pairs(rows)) for rows in by_event_assign.values()
    )

    # Matches = mutual likes, per pair, per event.
    by_event_directed: dict[str, set] = {}
    for l in likes:
        by_event_directed.setdefault(str(l["event_id"]), set()).add(
            (str(l["liker_attendee_id"]), str(l["liked_attendee_id"]))
        )
    summary.connections_total = sum(
        sum(1 for a, b in directed if a < b and (b, a) in directed)
        for directed in by_event_directed.values()
    )
    return summary


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
    # It's set ONCE (here or at creation) and then permanent: attendees may already
    # be typing it / have it on a QR, so silently rotating or clearing it would lock
    # them out. Once a non-empty code exists, any change or clear is rejected.
    access_code = changes.pop("access_code", None)
    if access_code is not None:
        if (fetch_access_code(db, event_id) or "").strip():
            raise HTTPException(
                status_code=409,
                detail="The access code is set once and can't be changed or removed afterwards.",
            )
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


@router.post("/{event_id}/archive", response_model=EventResponse)
def archive_event(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Soft-archive an event: hide it from the dashboard without destroying data
    (reversible via /unarchive). Owner only. A live event must be ended first so
    archiving can't yank a running room out from under attendees."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    if event["status"] == "active":
        raise HTTPException(status_code=409, detail="End the live event before archiving it")

    now = datetime.now(timezone.utc).isoformat()
    result = db.table("events").update({"archived_at": now}).eq("id", event_id).execute()
    record_audit(
        db,
        action="event.archived",
        entity_type="event",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=event_id,
    )
    return _attach_requires_code(db, result.data[0])


@router.post("/{event_id}/unarchive", response_model=EventResponse)
def unarchive_event(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Restore a soft-archived event back to the dashboard. Owner only."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

    result = db.table("events").update({"archived_at": None}).eq("id", event_id).execute()
    record_audit(
        db,
        action="event.unarchived",
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
    """Mint the event's access code (owner only) — but ONLY the first time. The
    code is permanent once set (attendees may already have it / a QR), so a second
    call returns 409 instead of rotating it. This stays as the one-time 'generate'
    for an event created open."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    if (fetch_access_code(db, event_id) or "").strip():
        raise HTTPException(
            status_code=409,
            detail="The access code is set once and can't be regenerated.",
        )
    code = generate_access_code(db)
    _upsert_access_code(db, event_id, code)
    record_audit(
        db,
        action="event.code_set",
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
    """Removal is not allowed once a code is set — it's permanent (attendees may
    already have it / a QR). Returns 409 when a code exists; a no-op otherwise."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    if (fetch_access_code(db, event_id) or "").strip():
        raise HTTPException(
            status_code=409,
            detail="The access code is permanent and can't be removed.",
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

    # Likes once, so we can derive both the counts AND the matched-pair set (the
    # latter highlights the mutual connections in the connection web).
    likes_rows = (
        db.table("connection_likes")
        .select("liker_attendee_id, liked_attendee_id")
        .eq("event_id", event_id)
        .execute()
        .data
        or []
    )
    directed = {(str(l["liker_attendee_id"]), str(l["liked_attendee_id"])) for l in likes_rows}
    total_likes = len(directed)
    matched_pairs = {frozenset((a, b)) for (a, b) in directed if (b, a) in directed}
    total_matches = len(matched_pairs)
    # Unique unordered pairs where at least one person liked the other → the funnel's
    # middle stage (always between introductions and mutual matches).
    liked_pair_set = {frozenset((a, b)) for (a, b) in directed}
    liked_pairs = len(liked_pair_set)

    # Weighted pair index — the single source for introductions, the graph, and all
    # relationship intelligence. Keeps the rounds each pair met in (repeat data).
    round_number_by_id = {str(r["id"]): r["round_number"] for r in rounds}
    pair_rounds = _pair_round_numbers(assignments, round_number_by_id)
    met_pairs = set(pair_rounds)  # distinct pairs who ever shared a table
    total_introductions = len(met_pairs)

    # People actually seated at least once = the population the connection metrics
    # are about (a registrant who never sat down can't have "met" anyone).
    seated_ids = {str(a["attendee_id"]) for a in assignments}
    seated_attendees = len(seated_ids)
    possible_introductions = seated_attendees * (seated_attendees - 1) // 2
    # Nobody-left-behind: the fewest distinct people any seated person met. Someone
    # seated alone for a round (no tablemates) has 0 — that's worth surfacing.
    min_people_met = min((len(met.get(aid, set())) for aid in seated_ids), default=0)

    # Avg % of the rest of the room each person met (a single, intuitive headline).
    pct_room_met = (
        round(avg_met / max(len(attendees) - 1, 1) * 100) if attendees else 0
    )

    # Per-round performance: seated count + NEW pairs created that round (so the
    # bar chart shows fresh connections per round, not cumulative). Rounds in order.
    names = {str(a["id"]): a["name"] for a in attendees}
    completed_rounds = sorted(
        (r for r in rounds if r["status"] == "completed"), key=lambda r: r["round_number"]
    )
    assigns_by_round: dict[str, list] = {}
    for a in assignments:
        assigns_by_round.setdefault(str(a["round_id"]), []).append(a)
    seen_pairs: set[frozenset] = set()
    round_performance: list[RoundPerf] = []
    for r in completed_rounds:
        rows = assigns_by_round.get(str(r["id"]), [])
        round_pairs = _unique_table_pairs(rows)
        new_pairs = round_pairs - seen_pairs
        seen_pairs |= round_pairs
        round_performance.append(
            RoundPerf(round_number=r["round_number"], seated=len(rows), introductions=len(new_pairs))
        )

    # Top connectors: who met the most distinct people.
    top_connectors = [
        TopConnector(attendee_id=aid, name=names.get(str(aid), "—"), count=len(people))
        for aid, people in sorted(met.items(), key=lambda kv: len(kv[1]), reverse=True)[:5]
    ]

    # Connection web: one node per seated person, one weighted edge per pair who
    # met. Each edge carries the rounds they shared (repeat strength) and whether
    # they liked/matched, so the graph is a relationship-intelligence tool — not a
    # decorative chart. Pilot-scale (~40) so the full graph is tiny.
    profile = {str(a["id"]): a for a in attendees}
    present_rounds: dict[str, set] = {}
    for a in assignments:
        present_rounds.setdefault(str(a["attendee_id"]), set()).add(str(a["round_id"]))
    mutual_by_person: dict[str, int] = {}
    for pair in matched_pairs:
        for pid in pair:
            mutual_by_person[pid] = mutual_by_person.get(pid, 0) + 1

    graph_nodes = [
        GraphNode(
            attendee_id=aid,
            name=names.get(aid, "—"),
            met=len(met.get(aid, set())),
            company=(profile.get(aid) or {}).get("company"),
            role=(profile.get(aid) or {}).get("role"),
            rounds_present=len(present_rounds.get(aid, set())),
            mutual_likes=mutual_by_person.get(aid, 0),
        )
        for aid in sorted(seated_ids, key=lambda x: names.get(x, "").lower())
    ]
    graph_edges = []
    for pair, rnds in pair_rounds.items():
        a, b = tuple(pair)
        graph_edges.append(
            GraphEdge(
                a=a,
                b=b,
                matched=pair in matched_pairs,
                liked=pair in liked_pair_set,
                weight=len(rnds),
                rounds=rnds,
            )
        )

    return EventAnalytics(
        total_attendees=len(attendees),
        rounds_completed=rounds_completed,
        avg_unique_people_met=avg_met,
        total_likes=total_likes,
        total_matches=total_matches,
        liked_pairs=liked_pairs,
        total_introductions=total_introductions,
        pct_room_met=pct_room_met,
        seated_attendees=seated_attendees,
        possible_introductions=possible_introductions,
        min_people_met=min_people_met,
        round_performance=round_performance,
        top_connectors=top_connectors,
        graph_nodes=graph_nodes,
        graph_edges=graph_edges,
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

    all_rounds = (
        db.table("rounds").select("id, round_number, status").eq("event_id", event_id).execute().data
        or []
    )
    rounds_completed = sum(1 for r in all_rounds if r["status"] == "completed")
    active = [r for r in all_rounds if r["status"] == "active"][:1]
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
        rounds_completed=rounds_completed,
    )
