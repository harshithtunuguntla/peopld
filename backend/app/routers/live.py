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


def _build_roster(rows: list[dict]) -> WaitingRoster:
    """WaitingRoster from a list of attendee rows (already filtered to non-left)."""
    preview = [
        RosterPerson(attendee_id=r["id"], name=r["name"], avatar_url=r.get("avatar_url"))
        for r in rows[:ROSTER_PREVIEW_LIMIT]
    ]
    return WaitingRoster(count=len(rows), preview=preview)


@router.get("", response_model=LiveStateResponse)
async def get_live_state(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """One-shot authoritative snapshot for the signed-in attendee (REQ-RT-01).

    Queries are issued in parallel batches so total latency ≈ slowest single
    query rather than the sum of all queries.
    """
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
    seated = False
    roster: WaitingRoster

    if active:
        started_at = active.get("started_at")
        ends_at = None
        if started_at:
            ends_at = _parse_iso(started_at) + timedelta(
                seconds=active["duration_seconds"] + int(active.get("total_paused_seconds") or 0)
            )
        round_payload = LiveRound(
            round_id=active["id"],
            round_number=active["round_number"],
            status=active["status"],
            started_at=started_at,
            duration_seconds=active["duration_seconds"],
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

            my_interests = [str(t) for t in (attendee.get("interests") or [])]
            my_interest_set = {t.casefold() for t in my_interests}

            mates: list[Tablemate] = []
            for row in (table_rows_res.data or []):
                aid = str(row["attendee_id"])
                if aid == attendee_id:
                    continue
                info = attendees_by_id.get(aid)
                if info:
                    their_interests = [str(t) for t in (info.get("interests") or [])]
                    shared = [t for t in their_interests if t.casefold() in my_interest_set]
                    mates.append(
                        Tablemate(
                            attendee_id=aid,
                            name=info["name"],
                            role=info["role"],
                            company=info.get("company"),
                            looking_for=info.get("looking_for"),
                            interests=their_interests,
                            shared_interests=shared,
                            avatar_url=info.get("avatar_url"),
                            liked=aid in liked_ids,
                            wanted=aid in wanted_ids,
                        )
                    )
            mates.sort(key=lambda m: m.name.lower())
            seat_payload = LiveSeat(table_number=table_number, tablemates=mates)

            ib = ib_res.data
            if ib:
                icebreaker_payload = LiveIcebreaker(
                    question_text=ib[0]["question_text"],
                    target_attendee_id=ib[0]["target_attendee_id"],
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

    return LiveStateResponse(
        server_time=now,
        event_status=event_status,
        phase=phase,
        event_name=event["name"],
        attendee_id=attendee["id"],
        attendee_name=attendee["name"],
        attendee_status=attendee["status"],
        target_rounds=event.get("target_rounds"),
        round_seconds=event.get("default_round_duration_seconds") or 300,
        round_topics=event.get("round_topics") or [],
        seated=seated,
        roster=roster,
        round=round_payload,
        seat=seat_payload,
        icebreaker=icebreaker_payload,
    )
