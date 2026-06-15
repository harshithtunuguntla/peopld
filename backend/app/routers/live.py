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
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, get_current_user
from app.models.schemas import (
    LiveIcebreaker,
    LiveRound,
    LiveSeat,
    LiveStateResponse,
    RosterPerson,
    Tablemate,
    WaitingRoster,
)

# How many faces to send for the waiting-room avatar stack (the UI shows "+N"
# for the rest). Keeps the payload small and avoids dumping the whole guest list.
ROSTER_PREVIEW_LIMIT = 12

logger = logging.getLogger("app.live")

router = APIRouter(prefix="/events/{event_id}/live", tags=["live"])


def _parse_iso(value: str) -> datetime:
    """Parse a Postgres/Supabase ISO timestamp into an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _active_round(db: Client, event_id: str) -> dict | None:
    res = (
        db.table("rounds")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _any_round_exists(db: Client, event_id: str) -> bool:
    res = db.table("rounds").select("id").eq("event_id", event_id).limit(1).execute()
    return bool(res.data)


def _event_attendees(db: Client, event_id: str) -> dict[str, dict]:
    rows = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    return {str(r["id"]): r for r in rows}


def _waiting_roster(db: Client, event_id: str) -> WaitingRoster:
    """Everyone currently in the room (anyone who hasn't left), for the waiting-
    room social proof. Returns a total count plus a capped sample of faces."""
    rows = (
        db.table("attendees")
        .select("id, name, avatar_url, status")
        .eq("event_id", event_id)
        .neq("status", "left")
        .execute()
        .data
        or []
    )
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

    The attendee is resolved from the JWT — no attendee id in the URL, so there
    is no IDOR surface (you can only ever see your own live state).
    """
    event = fetch_event_or_404(db, event_id)

    me = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if not me.data:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    attendee = me.data[0]

    now = datetime.now(timezone.utc)
    event_status = event["status"]
    active = _active_round(db, event_id)

    # Derive the macro-phase purely from current data so the phone shows the
    # right screen even if it missed the realtime transition that got us here.
    if event_status == "ended":
        phase = "ended"
    elif active:
        phase = "in_round"
    elif _any_round_exists(db, event_id):
        phase = "between_rounds"
    else:
        phase = "not_started"

    round_payload: LiveRound | None = None
    seat_payload: LiveSeat | None = None
    icebreaker_payload: LiveIcebreaker | None = None
    seated = False

    if active:
        started_at = active.get("started_at")
        ends_at = None
        if started_at:
            ends_at = _parse_iso(started_at) + timedelta(seconds=active["duration_seconds"])
        round_payload = LiveRound(
            round_id=active["id"],
            round_number=active["round_number"],
            status=active["status"],
            started_at=started_at,
            duration_seconds=active["duration_seconds"],
            ends_at=ends_at,
        )

        my_assignment = (
            db.table("table_assignments")
            .select("*")
            .eq("round_id", active["id"])
            .eq("attendee_id", attendee["id"])
            .limit(1)
            .execute()
        )
        if my_assignment.data:
            seated = True
            table_number = my_assignment.data[0]["table_number"]

            table_rows = (
                db.table("table_assignments")
                .select("*")
                .eq("round_id", active["id"])
                .eq("table_number", table_number)
                .execute()
            ).data or []
            attendees_by_id = _event_attendees(db, event_id)

            # Which tablemates have I already liked? (one query)
            my_likes = (
                db.table("connection_likes")
                .select("liked_attendee_id")
                .eq("event_id", event_id)
                .eq("liker_attendee_id", str(attendee["id"]))
                .execute()
            ).data or []
            liked_ids = {str(l["liked_attendee_id"]) for l in my_likes}

            my_interests = [str(t) for t in (attendee.get("interests") or [])]
            my_interest_set = {t.casefold() for t in my_interests}

            mates: list[Tablemate] = []
            for row in table_rows:
                aid = str(row["attendee_id"])
                if aid == str(attendee["id"]):
                    continue  # tablemates = everyone at the table except me
                info = attendees_by_id.get(aid)
                if info:
                    their_interests = [str(t) for t in (info.get("interests") or [])]
                    shared = [t for t in their_interests if t.casefold() in my_interest_set]
                    mates.append(
                        Tablemate(
                            attendee_id=aid,
                            name=info["name"],
                            role=info["role"],
                            looking_for=info.get("looking_for"),
                            interests=their_interests,
                            shared_interests=shared,
                            avatar_url=info.get("avatar_url"),
                            liked=aid in liked_ids,
                        )
                    )
            mates.sort(key=lambda m: m.name.lower())
            seat_payload = LiveSeat(table_number=table_number, tablemates=mates)

            # Icebreaker (Step 6): generated asynchronously, so it may not exist
            # yet — the table shows instantly, the question pops in moments later.
            ib = (
                db.table("icebreakers")
                .select("*")
                .eq("round_id", active["id"])
                .eq("recipient_attendee_id", attendee["id"])
                .limit(1)
                .execute()
            ).data
            if ib:
                icebreaker_payload = LiveIcebreaker(
                    question_text=ib[0]["question_text"],
                    target_attendee_id=ib[0]["target_attendee_id"],
                )

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
        seated=seated,
        roster=_waiting_roster(db, event_id),
        round=round_payload,
        seat=seat_payload,
        icebreaker=icebreaker_payload,
    )
