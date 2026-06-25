"""Attendee Live Dashboard — the authoritative state endpoint (Step 5, Realtime).

Design principle: **Realtime is a doorbell, REST is the source of truth.**
Supabase Realtime only tells a phone "something changed"; the phone then calls
this endpoint to learn what to render. Because Realtime is best-effort (messages
can be missed during sleep / network loss), this endpoint is the *guaranteed*
recovery path:

    REQ-RT-01 — any client that reconnects, refreshes, wakes from sleep, or
    regains network MUST recover authoritative event state within 3 seconds.

To make recovery a single network call, everything the dashboard needs comes
back in ONE round-trip: phase, the active round (with timing), the attendee's
table + tablemates, and the icebreaker. See docs/design/realtime.md.

Performance: queries are issued in three parallel batches using asyncio.gather
so independent DB calls don't wait on each other. Wall-clock latency is
dominated by the slowest call in each batch, not the sum of all calls.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, get_current_user
from app.models.schemas import (
    LiveIcebreaker,
    LiveRound,
    LiveSeat,
    LiveStateResponse,
    RosterPerson,
    Tablemate,
    WaitingRoster,
)

ROSTER_PREVIEW_LIMIT = 12

logger = logging.getLogger("app.live")

router = APIRouter(prefix="/events/{event_id}/live", tags=["live"])


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _make_tablemate(
    info: dict,
    *,
    my_interest_set: set[str],
    liked_ids: set[str],
    wanted_ids: set[str],
    notes_by_target: dict[str, str],
) -> Tablemate | None:
    """Build one Tablemate from an attendee row, tolerating bad data.

    Name/role are required by the schema; a row with a null name or role must not
    500 the whole table (and therefore everyone seated there), so we coerce missing
    values to safe placeholders. Returns None only if even that fails, so the caller
    can skip the row instead of crashing the snapshot."""
    aid = str(info["id"])
    their_interests = [str(t) for t in (info.get("interests") or [])]
    shared = [t for t in their_interests if t.casefold() in my_interest_set]
    try:
        return Tablemate(
            attendee_id=aid,
            name=info.get("name") or "Guest",
            role=info.get("role") or "",
            company=info.get("company"),
            looking_for=info.get("looking_for"),
            interests=their_interests,
            shared_interests=shared,
            avatar_url=info.get("avatar_url"),
            liked=aid in liked_ids,
            wanted=aid in wanted_ids,
            note=notes_by_target.get(aid),
        )
    except Exception:
        logger.warning("skipped malformed tablemate", extra={"attendee_id": aid})
        return None


def _build_recent_seat(db: Client, event_id: str, attendee: dict, round_id: str) -> LiveSeat | None:
    """The attendee's table from a just-finished round, with the same ❤️/wanted/note
    state as the live table — so the between-rounds screen lets them tag people they
    just met before the next round whisks the list away. Quiet phase, so this runs
    as plain sequential reads (no need for the active path's parallel batching)."""
    attendee_id = str(attendee["id"])
    my_seat = (
        db.table("table_assignments")
        .select("table_number")
        .eq("round_id", round_id)
        .eq("attendee_id", attendee_id)
        .limit(1)
        .execute()
        .data
    )
    if not my_seat:
        return None  # wasn't seated that round (late arrival / guest)
    table_number = my_seat[0]["table_number"]

    table_rows = (
        db.table("table_assignments")
        .select("attendee_id")
        .eq("round_id", round_id)
        .eq("table_number", table_number)
        .execute()
        .data
        or []
    )
    all_attendees = (
        db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    )
    attendees_by_id = {str(r["id"]): r for r in all_attendees}
    liked_ids = {
        str(l["liked_attendee_id"])
        for l in (
            db.table("connection_likes")
            .select("liked_attendee_id")
            .eq("event_id", event_id)
            .eq("liker_attendee_id", attendee_id)
            .execute()
            .data
            or []
        )
    }
    wanted_ids = {
        str(i["liked_attendee_id"])
        for i in (
            db.table("meeting_intents")
            .select("liked_attendee_id")
            .eq("event_id", event_id)
            .eq("liker_attendee_id", attendee_id)
            .execute()
            .data
            or []
        )
    }
    notes_by_target = {
        str(n["target_attendee_id"]): n["note"]
        for n in (
            db.table("connection_notes")
            .select("target_attendee_id, note")
            .eq("event_id", event_id)
            .eq("author_attendee_id", attendee_id)
            .execute()
            .data
            or []
        )
    }
    my_interest_set = {str(t).casefold() for t in (attendee.get("interests") or [])}

    mates: list[Tablemate] = []
    for row in table_rows:
        aid = str(row["attendee_id"])
        if aid == attendee_id:
            continue
        info = attendees_by_id.get(aid)
        if not info:
            continue
        mate = _make_tablemate(
            info,
            my_interest_set=my_interest_set,
            liked_ids=liked_ids,
            wanted_ids=wanted_ids,
            notes_by_target=notes_by_target,
        )
        if mate:
            mates.append(mate)
    mates.sort(key=lambda m: m.name.lower())
    return LiveSeat(table_number=table_number, tablemates=mates)


def _build_roster(rows: list[dict]) -> WaitingRoster:
    """WaitingRoster from attendee rows — "who's in the room" = people who have
    actually CHECKED IN (status 'arrived'), not everyone registered. A registered
    attendee who hasn't entered the room code isn't physically here, so they must
    not inflate the count (the count is the headline "N in the room").

    Defensive: a single malformed row (missing id, null name) must NEVER raise here
    — this runs in the shared path of EVERY /live call, so one bad row would 500 the
    snapshot for the entire room. We coerce a missing name to a safe placeholder and
    skip any row without an id, so the room screen always renders."""
    arrived = [r for r in rows if r.get("status") == "arrived"]
    preview: list[RosterPerson] = []
    for r in arrived[:ROSTER_PREVIEW_LIMIT]:
        rid = r.get("id")
        if not rid:
            continue
        preview.append(
            RosterPerson(attendee_id=rid, name=r.get("name") or "Guest", avatar_url=r.get("avatar_url"))
        )
    return WaitingRoster(count=len(arrived), preview=preview)


@router.get("", response_model=LiveStateResponse)
async def get_live_state(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """One-shot authoritative snapshot for the signed-in attendee (REQ-RT-01).

    Thin wrapper around the assembly so that an UNEXPECTED failure (a DB hiccup, a
    row we couldn't anticipate) is logged with full context and returned as a
    retryable 503 — never a silent 500 that takes the whole room's live screen
    dark with no trace. The row-level coercion in the assembly handles the known
    cases; this is the diagnostic net for everything else.
    """
    try:
        return await _assemble_live_state(event_id, user, db)
    except HTTPException:
        raise  # 404 not-registered / not-found are intentional, pass through
    except Exception:
        logger.exception(
            "live snapshot assembly failed",
            extra={"event_id": event_id, "user_id": getattr(user, "id", None)},
        )
        raise HTTPException(
            status_code=503,
            detail="Live state is temporarily unavailable — trying again…",
        )


async def _assemble_live_state(
    event_id: str,
    user: AuthUser,
    db: Client,
) -> LiveStateResponse:
    """Build the authoritative snapshot. Queries are issued in parallel batches so
    total latency ≈ slowest single query rather than the sum of all queries."""
    # --- Batch 1: always needed, all independent ---
    event_res, me_res, rounds_res = await asyncio.gather(
        asyncio.to_thread(
            lambda: db.table("events").select("*").eq("id", event_id).limit(1).execute()
        ),
        asyncio.to_thread(
            lambda: db.table("attendees")
            .select("*")
            .eq("event_id", event_id)
            .eq("user_id", user.id)
            .limit(1)
            .execute()
        ),
        asyncio.to_thread(
            lambda: db.table("rounds").select("*").eq("event_id", event_id).execute()
        ),
    )

    if not event_res.data:
        raise HTTPException(status_code=404, detail="Event not found")
    event = event_res.data[0]

    if not me_res.data:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    attendee = me_res.data[0]

    rounds = rounds_res.data or []
    active = next((r for r in rounds if r["status"] == "active"), None)
    any_round = bool(rounds)
    rounds_completed = sum(1 for r in rounds if r["status"] == "completed")

    now = datetime.now(timezone.utc)
    event_status = event["status"]

    if event_status == "ended":
        phase = "ended"
    elif active:
        phase = "in_round"
    elif any_round:
        phase = "between_rounds"
    else:
        phase = "not_started"

    round_payload: LiveRound | None = None
    seat_payload: LiveSeat | None = None
    icebreaker_payload: LiveIcebreaker | None = None
    recent_seat_payload: LiveSeat | None = None
    recent_round_number: int | None = None
    seated = False
    roster: WaitingRoster

    if active:
        # Coerce the timing fields — a string/None duration or an unparseable
        # started_at must never crash the snapshot for the whole room.
        duration_seconds = int(active.get("duration_seconds") or 0)
        started_at = active.get("started_at")
        ends_at = None
        if started_at:
            try:
                ends_at = _parse_iso(started_at) + timedelta(
                    seconds=duration_seconds + int(active.get("total_paused_seconds") or 0)
                )
            except Exception:
                logger.warning(
                    "could not compute ends_at", extra={"event_id": event_id, "round_id": active.get("id")}
                )
        round_payload = LiveRound(
            round_id=active["id"],
            round_number=active.get("round_number") or 0,
            status=active.get("status") or "active",
            started_at=started_at,
            duration_seconds=duration_seconds,
            ends_at=ends_at,
            paused_at=active.get("paused_at"),
        )

        # --- Batch 2: round is active, all independent ---
        active_id = active["id"]
        attendee_id = str(attendee["id"])
        my_seat_res, all_attendees_res, likes_res, intents_res = await asyncio.gather(
            asyncio.to_thread(
                lambda: db.table("table_assignments")
                .select("*")
                .eq("round_id", active_id)
                .eq("attendee_id", attendee_id)
                .limit(1)
                .execute()
            ),
            asyncio.to_thread(
                lambda: db.table("attendees").select("*").eq("event_id", event_id).execute()
            ),
            asyncio.to_thread(
                lambda: db.table("connection_likes")
                .select("liked_attendee_id")
                .eq("event_id", event_id)
                .eq("liker_attendee_id", attendee_id)
                .execute()
            ),
            asyncio.to_thread(
                lambda: db.table("meeting_intents")
                .select("liked_attendee_id")
                .eq("event_id", event_id)
                .eq("liker_attendee_id", attendee_id)
                .execute()
            ),
        )

        attendees_by_id = {str(r["id"]): r for r in (all_attendees_res.data or [])}
        liked_ids = {str(l["liked_attendee_id"]) for l in (likes_res.data or [])}
        wanted_ids = {str(i["liked_attendee_id"]) for i in (intents_res.data or [])}

        # Roster built from already-fetched attendees — no extra DB call.
        roster_rows = [r for r in attendees_by_id.values() if r.get("status") != "left"]
        roster = _build_roster(roster_rows)

        if my_seat_res.data:
            seated = True
            table_number = my_seat_res.data[0]["table_number"]

            # --- Batch 3: seated, both independent ---
            table_rows_res, ib_res = await asyncio.gather(
                asyncio.to_thread(
                    lambda: db.table("table_assignments")
                    .select("*")
                    .eq("round_id", active_id)
                    .eq("table_number", table_number)
                    .execute()
                ),
                asyncio.to_thread(
                    lambda: db.table("icebreakers")
                    .select("*")
                    .eq("round_id", active_id)
                    .eq("recipient_attendee_id", attendee_id)
                    .limit(1)
                    .execute()
                ),
            )

            # My own private notes about people (author-private), so a note I
            # already jotted pre-fills when this tablemate reappears. (One query.)
            my_notes = (
                db.table("connection_notes")
                .select("target_attendee_id, note")
                .eq("event_id", event_id)
                .eq("author_attendee_id", str(attendee["id"]))
                .execute()
            ).data or []
            notes_by_target = {str(n["target_attendee_id"]): n["note"] for n in my_notes}

            my_interests = [str(t) for t in (attendee.get("interests") or [])]
            my_interest_set = {t.casefold() for t in my_interests}

            mates: list[Tablemate] = []
            for row in (table_rows_res.data or []):
                aid = str(row["attendee_id"])
                if aid == attendee_id:
                    continue
                info = attendees_by_id.get(aid)
                if info:
                    mate = _make_tablemate(
                        info,
                        my_interest_set=my_interest_set,
                        liked_ids=liked_ids,
                        wanted_ids=wanted_ids,
                        notes_by_target=notes_by_target,
                    )
                    if mate:
                        mates.append(mate)
            mates.sort(key=lambda m: m.name.lower())
            seat_payload = LiveSeat(table_number=table_number, tablemates=mates)

            ib = ib_res.data
            if ib and ib[0].get("question_text") and ib[0].get("target_attendee_id"):
                # A malformed icebreaker row must degrade to "no icebreaker", never
                # 500 the seat — the table is far more important than the question.
                try:
                    icebreaker_payload = LiveIcebreaker(
                        question_text=ib[0]["question_text"],
                        target_attendee_id=ib[0]["target_attendee_id"],
                    )
                except Exception:
                    logger.warning(
                        "skipped malformed icebreaker", extra={"event_id": event_id, "round_id": active_id}
                    )
    else:
        # Not in a round: only need attendees for the waiting-room roster.
        roster_res = await asyncio.to_thread(
            lambda: db.table("attendees")
            .select("id, name, avatar_url, status")
            .eq("event_id", event_id)
            .neq("status", "left")
            .execute()
        )
        roster = _build_roster(roster_res.data or [])

        # Between rounds: surface the table you just left so the "❤️ / note before
        # the next round" moment isn't lost when phones go back in pockets.
        if phase == "between_rounds":
            completed = [
                r for r in rounds if r["status"] == "completed" and r.get("ended_at")
            ]
            if completed:
                last = max(completed, key=lambda r: r["ended_at"])
                recent_seat_payload = await asyncio.to_thread(
                    _build_recent_seat, db, event_id, attendee, last["id"]
                )
                if recent_seat_payload:
                    recent_round_number = last["round_number"]

    attendee_status = attendee.get("status")
    if attendee_status not in ("registered", "arrived", "left"):
        attendee_status = "registered"

    return LiveStateResponse(
        server_time=now,
        event_status=event_status,
        phase=phase,
        event_name=event.get("name") or "Event",
        attendee_id=attendee["id"],
        attendee_name=attendee.get("name") or "there",
        attendee_status=attendee_status,
        attendee_tag=attendee.get("tag") or "attendee",
        target_rounds=event.get("target_rounds"),
        round_seconds=event.get("default_round_duration_seconds") or 300,
        round_topics=event.get("round_topics") or [],
        seated=seated,
        rounds_completed=rounds_completed,
        roster=roster,
        round=round_payload,
        seat=seat_payload,
        icebreaker=icebreaker_payload,
        recent_seat=recent_seat_payload,
        recent_round_number=recent_round_number,
    )
