import hashlib
import logging
from datetime import datetime, timezone
from math import ceil
from collections import Counter

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from supabase import Client

from app.algorithm import (
    PairCounts,
    RotationError,
    draft_snapshot_hash,
    generate_rotation,
    plan_rounds,
    table_capacity,
    table_ceiling,
)
from app.audit import record_audit
from app.icebreakers import engine as icebreaker_engine
from app.realtime import broadcast_event_changed
from app.database import get_supabase
from app.deps import AuthUser, fetch_event_or_404, get_current_organizer_id, get_current_user, require_event_owner
from app.models.schemas import (
    RoundCancelResponse,
    RoundDraftResponse,
    RoundExtendRequest,
    RoundExtensionPollResponse,
    RoundExtensionVoteRequest,
    RoundMoveRequest,
    RoundResponse,
    RoundWithAssignmentsResponse,
    RunSheet,
    RunSheetRound,
    RunSheetTable,
    TableAssignmentResponse,
)

logger = logging.getLogger("app.rounds")

router = APIRouter(prefix="/events/{event_id}/rounds", tags=["rounds"])

EXTENSION_POLL_SECONDS = (120, 180, 300)
EXTENSION_POLL_THRESHOLD_PERCENT = 80


def _parse_iso(value: str) -> datetime:
    """Parse a Postgres/Supabase ISO timestamp into an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _fetch_active_round(db: Client, event_id: str) -> dict:
    result = (
        db.table("rounds")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No active round")
    return result.data[0]


def _get_active_round(db: Client, event_id: str) -> dict | None:
    """The active round if there is one, else None (non-raising)."""
    result = (
        db.table("rounds")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _has_active_round(db: Client, event_id: str) -> bool:
    return _get_active_round(db, event_id) is not None


def _round_with_assignments(db: Client, round_row: dict) -> dict:
    """A round row plus all its table assignments (the publish/current shape)."""
    assignments = (
        db.table("table_assignments")
        .select("*")
        .eq("round_id", round_row["id"])
        .execute()
        .data
        or []
    )
    result = dict(round_row)
    result["assignments"] = assignments
    result["extension_poll"] = _latest_extension_poll_response(db, round_row["event_id"], round_row["id"])
    return result


def _eligible_extension_voters(db: Client, event_id: str) -> list[dict]:
    """Attendees who are currently checked in and can vote on a round extension."""
    return (
        db.table("attendees")
        .select("id")
        .eq("event_id", event_id)
        .eq("status", "arrived")
        .execute()
        .data
        or []
    )


def _fetch_my_attendee(db: Client, event_id: str, user_id: str) -> dict:
    row = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    return row[0]


def _latest_extension_poll(db: Client, event_id: str, round_id: str) -> dict | None:
    polls = (
        db.table("round_extension_polls")
        .select("*")
        .eq("event_id", event_id)
        .eq("round_id", round_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return polls[0] if polls else None


def _active_extension_poll(db: Client, event_id: str, round_id: str) -> dict | None:
    polls = (
        db.table("round_extension_polls")
        .select("*")
        .eq("event_id", event_id)
        .eq("round_id", round_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    return polls[0] if polls else None


def _latest_extension_poll_response(
    db: Client,
    event_id: str,
    round_id: str,
    attendee_id: str | None = None,
) -> RoundExtensionPollResponse | None:
    poll = _latest_extension_poll(db, event_id, round_id)
    return _extension_poll_response(db, poll, attendee_id) if poll else None


def _extension_poll_response(
    db: Client,
    poll: dict,
    attendee_id: str | None = None,
) -> RoundExtensionPollResponse:
    votes = (
        db.table("round_extension_votes")
        .select("*")
        .eq("poll_id", poll["id"])
        .execute()
        .data
        or []
    )
    yes_votes = [int(v["seconds"]) for v in votes if int(v["seconds"]) > 0]
    counts = Counter(yes_votes)
    my_vote = None
    if attendee_id:
        mine = next((v for v in votes if str(v["attendee_id"]) == str(attendee_id)), None)
        my_vote = int(mine["seconds"]) if mine else None
    eligible = int(poll["eligible_count"])
    return RoundExtensionPollResponse(
        id=poll["id"],
        event_id=poll["event_id"],
        round_id=poll["round_id"],
        status=poll["status"],
        eligible_count=eligible,
        threshold_percent=int(poll.get("threshold_percent") or EXTENSION_POLL_THRESHOLD_PERCENT),
        threshold_count=ceil(eligible * int(poll.get("threshold_percent") or EXTENSION_POLL_THRESHOLD_PERCENT) / 100),
        votes_count=len(votes),
        yes_count=len(yes_votes),
        no_count=sum(1 for v in votes if int(v["seconds"]) == 0),
        vote_counts={seconds: counts.get(seconds, 0) for seconds in EXTENSION_POLL_SECONDS},
        selected_seconds=poll.get("selected_seconds"),
        my_vote_seconds=my_vote,
        created_at=poll["created_at"],
        resolved_at=poll.get("resolved_at"),
    )


def _resolve_extension_poll_if_ready(
    db: Client,
    event_id: str,
    poll: dict,
    background_tasks: BackgroundTasks,
    actor_user_id: str,
) -> dict:
    """Apply the 80% rule once, using the backend as the timing authority."""
    if poll["status"] != "active":
        return poll
    votes = (
        db.table("round_extension_votes")
        .select("*")
        .eq("poll_id", poll["id"])
        .execute()
        .data
        or []
    )
    eligible = max(1, int(poll["eligible_count"]))
    threshold = ceil(eligible * int(poll.get("threshold_percent") or EXTENSION_POLL_THRESHOLD_PERCENT) / 100)
    yes_votes = [int(v["seconds"]) for v in votes if int(v["seconds"]) > 0]
    now = datetime.now(timezone.utc).isoformat()

    if len(yes_votes) >= threshold:
        counts = Counter(yes_votes)
        selected_seconds = max(
            EXTENSION_POLL_SECONDS,
            key=lambda seconds: (counts.get(seconds, 0), seconds),
        )
        winner = (
            db.table("round_extension_polls")
            .update({"status": "extended", "selected_seconds": selected_seconds, "resolved_at": now})
            .eq("id", poll["id"])
            .eq("status", "active")
            .execute()
            .data
        )
        if not winner:
            return _latest_extension_poll(db, event_id, poll["round_id"]) or poll
        active = _fetch_active_round(db, event_id)
        new_duration = int(active["duration_seconds"]) + selected_seconds
        db.table("rounds").update({"duration_seconds": new_duration}).eq("id", active["id"]).execute()
        background_tasks.add_task(
            record_audit,
            db,
            action="round.extension_poll_extended",
            entity_type="round_extension_poll",
            actor_user_id=actor_user_id,
            event_id=event_id,
            entity_id=poll["id"],
            metadata={
                "round_number": active["round_number"],
                "eligible_count": eligible,
                "yes_count": len(yes_votes),
                "added_seconds": selected_seconds,
            },
        )
        background_tasks.add_task(broadcast_event_changed, event_id, "extension_poll_extended")
        return winner[0]

    if len(votes) >= eligible:
        rejected = (
            db.table("round_extension_polls")
            .update({"status": "rejected", "resolved_at": now})
            .eq("id", poll["id"])
            .eq("status", "active")
            .execute()
            .data
        )
        if rejected:
            background_tasks.add_task(
                record_audit,
                db,
                action="round.extension_poll_rejected",
                entity_type="round_extension_poll",
                actor_user_id=actor_user_id,
                event_id=event_id,
                entity_id=poll["id"],
                metadata={"eligible_count": eligible, "yes_count": len(yes_votes)},
            )
            background_tasks.add_task(broadcast_event_changed, event_id, "extension_poll_rejected")
            return rejected[0]
    return poll


def _fetch_draft(db: Client, event_id: str) -> dict | None:
    result = (
        db.table("round_drafts").select("*").eq("event_id", event_id).limit(1).execute()
    )
    return result.data[0] if result.data else None


# Guests who attend but never join the rotation. A speaker/host is there to
# present, not to be shuffled between tables — they're excluded from seating
# (and, per Phase 3a, can't be picked either). Default 'attendee' is always seated.
NON_SEATED_TAGS = ("speaker", "host")


def _table_bounds(event: dict) -> tuple[int | None, int | None]:
    """Organizer-set (min, max) per-table size, or (None, None) for the defaults."""
    return event.get("min_per_table"), event.get("max_per_table")


def _arrived_pool(db: Client, event_id: str) -> list[dict]:
    """The seated pool: status='arrived' attendees, minus non-seated guests
    (speakers/hosts). Only these people are ever placed at tables."""
    result = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "arrived")
        .execute()
    )
    rows = result.data or []
    return [a for a in rows if (a.get("tag") or "attendee") not in NON_SEATED_TAGS]


def _pair_counts(db: Client, event_id: str) -> PairCounts:
    """History from ALL published rounds (active + completed). People who
    shared a table count as met even if the round was ended early."""
    assignments = (
        db.table("table_assignments").select("*").eq("event_id", event_id).execute().data
        or []
    )
    groups: dict[tuple, list[str]] = {}
    for a in assignments:
        groups.setdefault((a["round_id"], a["table_number"]), []).append(
            str(a["attendee_id"])
        )
    counts: PairCounts = {}
    for group in groups.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                pair = frozenset((group[i], group[j]))
                counts[pair] = counts.get(pair, 0) + 1
    return counts


def _meeting_intents(db: Client, event_id: str, seated_ids: set[str]) -> set[tuple[str, str]]:
    """Directed "want to meet" picks (liker -> liked), restricted to the SEATED
    pool. A pick whose liker or liked person isn't arrived (a no-show, or a guest
    not in the rotation) leaves the seating problem entirely and is dropped — so
    the planner only ever tries to honor picks it can physically place."""
    rows = (
        db.table("meeting_intents")
        .select("liker_attendee_id, liked_attendee_id")
        .eq("event_id", event_id)
        .execute()
        .data
        or []
    )
    intents: set[tuple[str, str]] = set()
    for r in rows:
        liker, liked = str(r["liker_attendee_id"]), str(r["liked_attendee_id"])
        if liker in seated_ids and liked in seated_ids:
            intents.add((liker, liked))
    return intents


def _plan_cache_hash(arrived_hash: str, intents: set[tuple[str, str]]) -> str:
    """Cache key for the multi-round plan: attendance/config AND the seated picks.

    The draft's own `arrived_hash` stays attendance-only (the stale-publish guard
    is about who's in the room). The PLAN, though, is also a function of the picks
    it honored — so when an attendee changes a pick mid-event, this key changes,
    the cached plan is treated as stale, and the next /start re-plans the remaining
    rounds from the fixed history (live re-planning, validated in simulate_intent).
    """
    fingerprint = "none"
    if intents:
        fingerprint = hashlib.sha256(
            ",".join(sorted(f"{a}>{b}" for a, b in intents)).encode()
        ).hexdigest()
    return hashlib.sha256(f"{arrived_hash}|{fingerprint}".encode()).hexdigest()


def _next_round_number(db: Client, event_id: str) -> int:
    rounds = db.table("rounds").select("*").eq("event_id", event_id).execute().data or []
    return max((r["round_number"] for r in rounds), default=0) + 1


def _fetch_plan(db: Client, event_id: str) -> dict | None:
    result = db.table("round_plans").select("*").eq("event_id", event_id).limit(1).execute()
    return result.data[0] if result.data else None


def _store_plan(db: Client, event_id: str, planned_for_hash: str,
                horizon_start_round: int, plan: list[dict]) -> None:
    """Upsert the cached plan (UNIQUE(event_id) -> at most one per event)."""
    payload = {
        "event_id": event_id,
        "planned_for_hash": planned_for_hash,
        "horizon_start_round": horizon_start_round,
        "plan": plan,
    }
    if _fetch_plan(db, event_id):
        db.table("round_plans").update(payload).eq("event_id", event_id).execute()
    else:
        db.table("round_plans").insert(payload).execute()


def _resolve_horizon(event: dict, arrived_count: int, next_round_number: int) -> int:
    """How many rounds to plan ahead from here.

    Uses the organizer's intended round count (target_rounds) when set, else the
    room's novelty ceiling. Always at least 1 (the round being started).
    """
    seats = event["seats_per_table"]
    target = event.get("target_rounds")
    if not target:
        ceiling = ceil((arrived_count - 1) / max(seats - 1, 1)) if arrived_count > 1 else 1
        target = min(max(ceiling, 1), 12)
    return max(1, int(target) - (next_round_number - 1))


def _round_repeat_pairings(seating: dict[str, int], pair_counts: PairCounts) -> int:
    """Seated pairs in this one round that have already met in a published round."""
    groups: dict[int, list[str]] = {}
    for attendee_id, table_number in seating.items():
        groups.setdefault(table_number, []).append(attendee_id)
    repeats = 0
    for group in groups.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if pair_counts.get(frozenset((group[i], group[j])), 0) > 0:
                    repeats += 1
    return repeats


def _seating_for_next_round(
    db: Client, event: dict, event_id: str, force_replan: bool = False
) -> tuple[dict[str, int], str, PairCounts]:
    """Next round's seating: follow the cached plan, or re-plan if it's stale.

    Re-plans (and re-caches) when: there is no plan, the arrived set / table
    config changed since the plan was made (hash mismatch), the plan doesn't
    cover this round number, or a regenerate forced it. Otherwise the cached
    plan is followed (this is what preserves the lookahead benefit).

    Returns (seating, current_hash, pair_counts). Raises 422 on impossible config.
    """
    pool = _arrived_pool(db, event_id)
    arrived_ids = sorted(str(a["id"]) for a in pool)
    num_tables, seats = event["num_tables"], event["seats_per_table"]
    min_size, max_size = _table_bounds(event)
    # The draft hash is attendance + table config (stale-publish guard); the plan
    # cache key also folds in the seated picks so a mid-event pick change re-plans.
    arrived_hash = draft_snapshot_hash(arrived_ids, num_tables, seats, min_size, max_size)
    intents = _meeting_intents(db, event_id, set(arrived_ids))
    plan_hash = _plan_cache_hash(arrived_hash, intents)
    next_number = _next_round_number(db, event_id)
    pair_counts = _pair_counts(db, event_id)

    if not force_replan:
        cached = _fetch_plan(db, event_id)
        if cached and cached["planned_for_hash"] == plan_hash:
            idx = next_number - cached["horizon_start_round"]
            plan = cached["plan"]
            if 0 <= idx < len(plan):
                return plan[idx], arrived_hash, pair_counts

    horizon = _resolve_horizon(event, len(arrived_ids), next_number)
    try:
        result = plan_rounds(arrived_ids, pair_counts, num_tables, seats, horizon,
                             intents=intents, min_size=min_size, max_size=max_size)
        seatings = result.rounds
    except RotationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        # Reliability over cleverness: if the planner ever fails unexpectedly,
        # fall back to greedy for this round so the event never stalls.
        logger.exception("planner failed — falling back to greedy", extra={"event_id": event_id})
        try:
            rotation = generate_rotation(arrived_ids, pair_counts, num_tables, seats,
                                         min_size=min_size, max_size=max_size)
        except RotationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        return rotation.tables, arrived_hash, pair_counts

    _store_plan(db, event_id, plan_hash, next_number, seatings)
    return seatings[0], arrived_hash, pair_counts


def _build_draft_row(db: Client, event: dict, event_id: str,
                     force_replan: bool = False) -> tuple[dict, dict[str, dict]]:
    """Materialize the next round's seating (from the plan) into a draft row.

    Returns (draft row ready to store, attendee lookup for the preview).
    Raises 422 with an organizer-readable message when no valid seating exists.
    """
    pool = _arrived_pool(db, event_id)
    seating, current_hash, pair_counts = _seating_for_next_round(
        db, event, event_id, force_replan=force_replan
    )
    row = {
        "event_id": event_id,
        "round_number": _next_round_number(db, event_id),
        "duration_seconds": event["default_round_duration_seconds"],
        "assignments": [
            {"attendee_id": attendee_id, "table_number": table_number}
            for attendee_id, table_number in seating.items()
        ],
        "arrived_hash": current_hash,
        "repeat_pairings": _round_repeat_pairings(seating, pair_counts),
    }
    return row, {str(a["id"]): a for a in pool}


def _capacity_warning(event: dict, assignments: list[dict]) -> dict | None:
    """Heads-up when the draft overfills past the max table size (room over capacity).

    The plan always seats everyone (no one is dropped); this just tells the organizer
    a few tables are above the ceiling so they can add a table or accept the squeeze.
    None when everything fits under the ceiling.
    """
    if not assignments:
        return None
    sizes: dict[int, int] = {}
    for a in assignments:
        sizes[a["table_number"]] = sizes.get(a["table_number"], 0) + 1
    min_size, max_size = _table_bounds(event)
    ceil_ = table_ceiling(event["seats_per_table"], min_size, max_size)
    biggest = max(sizes.values())
    if biggest <= ceil_:
        return None
    return {
        "seated": len(assignments),
        "capacity": table_capacity(event["num_tables"], event["seats_per_table"], min_size, max_size),
        "num_tables": event["num_tables"],
        "max_per_table": ceil_,
        "biggest_table": biggest,
        "overfilled_tables": sum(1 for c in sizes.values() if c > ceil_),
    }


def _draft_response(event: dict, draft: dict, attendees_by_id: dict[str, dict]) -> dict:
    assignments = [
        {
            "attendee_id": a["attendee_id"],
            "name": attendees_by_id.get(str(a["attendee_id"]), {}).get("name", "(unknown)"),
            "table_number": a["table_number"],
        }
        for a in draft["assignments"]
    ]
    return {
        "id": draft["id"],
        "event_id": draft["event_id"],
        "round_number": draft["round_number"],
        "duration_seconds": draft["duration_seconds"],
        "arrived_count": len(assignments),
        "table_count": len({a["table_number"] for a in assignments}),
        "repeat_pairings": draft.get("repeat_pairings", 0),
        "assignments": assignments,
        "capacity_warning": _capacity_warning(event, draft["assignments"]),
        "created_at": draft["created_at"],
    }


@router.post("/start", response_model=RoundDraftResponse, status_code=201)
def start_round(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Generate a seating DRAFT for the organizer to preview.

    Attendee phones see nothing until /publish — drafts live in round_drafts,
    which has no client RLS access and is not in the realtime publication.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    if _has_active_round(db, event_id):
        raise HTTPException(status_code=409, detail="End the current round first")
    if _fetch_draft(db, event_id):
        raise HTTPException(
            status_code=409,
            detail="A draft already exists — publish or regenerate it",
        )

    row, attendees_by_id = _build_draft_row(db, event, event_id)
    try:
        stored = db.table("round_drafts").insert(row).execute().data[0]
    except Exception:
        # Race on double-click: the UNIQUE(event_id) constraint caught it.
        logger.warning("draft insert conflict", extra={"event_id": event_id})
        raise HTTPException(
            status_code=409,
            detail="A draft already exists — publish or regenerate it",
        )

    background_tasks.add_task(
        record_audit,
        db,
        action="round.draft_created",
        entity_type="round_draft",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=stored["id"],
        metadata={
            "round_number": stored["round_number"],
            "arrived_count": len(attendees_by_id),
            "repeat_pairings": stored["repeat_pairings"],
        },
    )
    return _draft_response(event, stored, attendees_by_id)


@router.post("/regenerate", response_model=RoundDraftResponse)
def regenerate_draft(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Replace the pending draft with a fresh one (re-reads the arrived pool)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    draft = _fetch_draft(db, event_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft to regenerate — start a round first")

    # Force a fresh plan: regenerating only this round would desync the cached
    # plan (later rounds were optimized around the seating we're discarding).
    row, attendees_by_id = _build_draft_row(db, event, event_id, force_replan=True)
    changes = {k: row[k] for k in
               ("round_number", "duration_seconds", "assignments", "arrived_hash", "repeat_pairings")}
    updated = db.table("round_drafts").update(changes).eq("id", draft["id"]).execute().data[0]

    background_tasks.add_task(
        record_audit,
        db,
        action="round.draft_regenerated",
        entity_type="round_draft",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=draft["id"],
        metadata={
            "round_number": updated["round_number"],
            "arrived_count": len(attendees_by_id),
            "repeat_pairings": updated["repeat_pairings"],
        },
    )
    return _draft_response(event, updated, attendees_by_id)


@router.get("/draft", response_model=RoundDraftResponse)
def get_draft(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Re-fetch the pending preview (e.g., after the organizer reloads the page)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    draft = _fetch_draft(db, event_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No pending draft")
    attendees = (
        db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    )
    return _draft_response(event, draft, {str(a["id"]): a for a in attendees})


@router.post("/draft/move", response_model=RoundDraftResponse)
def move_draft_seat(
    event_id: str,
    body: RoundMoveRequest,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Manual override: move one person to another existing table in the pending
    draft, before publishing. The organizer always gets the final say over seating
    — the auto-plan is a strong starting point, not a cage. Recomputes the repeat
    count so the trust signal stays honest; the arrived pool is unchanged so the
    publish stale-guard still passes.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    draft = _fetch_draft(db, event_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft to edit — start a round first")

    assignments = draft["assignments"]
    target_id = str(body.attendee_id)
    if not any(str(a["attendee_id"]) == target_id for a in assignments):
        raise HTTPException(status_code=404, detail="That person isn't in this round")
    table_numbers = {a["table_number"] for a in assignments}
    if body.table_number not in table_numbers:
        raise HTTPException(
            status_code=422,
            detail=f"Table {body.table_number} isn't part of this round",
        )

    new_assignments = [
        {**a, "table_number": body.table_number} if str(a["attendee_id"]) == target_id else a
        for a in assignments
    ]
    seating = {str(a["attendee_id"]): a["table_number"] for a in new_assignments}
    repeats = _round_repeat_pairings(seating, _pair_counts(db, event_id))
    updated = (
        db.table("round_drafts")
        .update({"assignments": new_assignments, "repeat_pairings": repeats})
        .eq("id", draft["id"])
        .execute()
        .data[0]
    )

    # The cached multi-round plan was optimized around the ORIGINAL seating for this
    # round; a manual edit makes the look-ahead stale. Drop it so the next round
    # re-plans from the actual published history (correctness over the cache).
    db.table("round_plans").delete().eq("event_id", event_id).execute()

    background_tasks.add_task(
        record_audit,
        db,
        action="round.draft_edited",
        entity_type="round_draft",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=draft["id"],
        metadata={"round_number": updated["round_number"], "table_number": body.table_number},
    )

    attendees = (
        db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    )
    return _draft_response(event, updated, {str(a["id"]): a for a in attendees})


@router.post("/publish", response_model=RoundWithAssignmentsResponse, status_code=201)
def publish_round(
    event_id: str,
    response: Response,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Make the draft live: create the round + assignments (Realtime fires here),
    then delete the draft. Blocked if attendance or table config changed since
    the preview was generated (stale-draft guard)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    draft = _fetch_draft(db, event_id)
    if not draft:
        # Idempotency (REQ-RT-03): a publish whose response was lost (timeout)
        # may have actually succeeded — the draft is already consumed. If a round
        # is now active, return it instead of a confusing 404, so a retry is safe.
        existing = _get_active_round(db, event_id)
        if existing:
            response.status_code = 200  # idempotent retry — not a fresh create
            # Self-heal: if the first publish's generation was interrupted, retry it
            # (generate_for_round is a no-op when icebreakers already exist).
            background_tasks.add_task(
                icebreaker_engine.generate_for_round, db, event_id, existing["id"]
            )
            return _round_with_assignments(db, existing)
        raise HTTPException(status_code=404, detail="No draft to publish — start a round first")
    if _has_active_round(db, event_id):
        raise HTTPException(status_code=409, detail="End the current round first")

    pool_ids = [str(a["id"]) for a in _arrived_pool(db, event_id)]
    min_size, max_size = _table_bounds(event)
    current_hash = draft_snapshot_hash(
        pool_ids, event["num_tables"], event["seats_per_table"], min_size, max_size
    )
    if current_hash != draft["arrived_hash"]:
        raise HTTPException(
            status_code=409,
            detail="Attendance or table settings changed since this preview — regenerate the draft",
        )

    # Publish makes the SEATING live (phones show their table) but does NOT start
    # the clock. started_at stays null until the organizer hits "Start round", so
    # people have time to actually find their seats before the timer eats into the
    # conversation. The countdown everywhere derives from started_at, so a null
    # one simply renders as "waiting for the host to start".
    try:
        round_row = (
            db.table("rounds")
            .insert(
                {
                    "event_id": event_id,
                    "round_number": _next_round_number(db, event_id),
                    "duration_seconds": draft["duration_seconds"],
                    "started_at": None,
                    "ended_at": None,
                    "status": "active",
                }
            )
            .execute()
            .data[0]
        )
    except Exception:
        # Lost a concurrent publish race: UNIQUE(event_id, round_number) rejected
        # the duplicate. The winner already created this round — return it rather
        # than 500, so double-clicks resolve to one round (REQ-RT-03 idempotency).
        existing = _get_active_round(db, event_id)
        if existing:
            logger.warning("publish race resolved to existing round", extra={"event_id": event_id})
            response.status_code = 200  # idempotent — the winner already created it
            background_tasks.add_task(
                icebreaker_engine.generate_for_round, db, event_id, existing["id"]
            )
            return _round_with_assignments(db, existing)
        logger.exception("publish failed creating round", extra={"event_id": event_id})
        raise HTTPException(status_code=500, detail="Failed to publish the round — try again")

    assignment_rows = [
        {
            "round_id": round_row["id"],
            "event_id": event_id,
            "attendee_id": a["attendee_id"],
            "table_number": a["table_number"],
        }
        for a in draft["assignments"]
    ]
    try:
        assignments = db.table("table_assignments").insert(assignment_rows).execute().data
    except Exception:
        # Never leave an active round with no seating behind — roll it back.
        db.table("rounds").delete().eq("id", round_row["id"]).execute()
        logger.exception(
            "publish failed writing assignments", extra={"event_id": event_id}
        )
        raise HTTPException(status_code=500, detail="Failed to publish the round — try again")

    db.table("round_drafts").delete().eq("id", draft["id"]).execute()

    background_tasks.add_task(
        record_audit,
        db,
        action="round.published",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=round_row["id"],
        metadata={
            "round_number": round_row["round_number"],
            "attendee_count": len(assignment_rows),
            "repeat_pairings": draft.get("repeat_pairings", 0),
        },
    )

    # Ring the doorbell: ONE broadcast tells every phone to re-fetch and see the
    # new seating (replaces the heavy per-row postgres_changes fan-out). The
    # icebreaker generation below sends its own doorbell when the questions land.
    background_tasks.add_task(broadcast_event_changed, event_id, "publish")

    # Async (spec §9): phones see the table now; icebreakers arrive seconds later.
    # generate_for_round broadcasts a second doorbell when it finishes, so the
    # questions pop in without waiting on the LLM. Publish never waits on the LLM.
    background_tasks.add_task(
        icebreaker_engine.generate_for_round, db, event_id, round_row["id"]
    )

    result = dict(round_row)
    result["assignments"] = assignments
    return result


@router.post("/begin", response_model=RoundResponse)
def begin_round(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Start the timer on a published-but-not-yet-started round.

    Publish reveals the seating; this begins the countdown for everyone at once
    (stamps started_at=now). Idempotent: starting an already-running round just
    returns it, so a double-tap can't reset the clock.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)  # 404 if there's no current round
    if active.get("started_at"):
        return active  # already running — idempotent, never restart the clock
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("rounds")
        .update({"started_at": now})
        .eq("id", active["id"])
        .execute()
    )
    background_tasks.add_task(
        record_audit,
        db,
        action="round.started",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"]},
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "begin")
    return result.data[0]


@router.post("/extend", response_model=RoundResponse)
def extend_round(
    event_id: str,
    body: RoundExtendRequest,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Add time to the current round (the "+ Add time" escape hatch).

    Bumps duration_seconds, which the effective-end math everywhere is derived
    from — so it works whether the round is running, paused, or already at zero
    (a few seconds past the buzzer the organizer can still grant more time).
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)
    new_duration = int(active["duration_seconds"]) + int(body.seconds)
    result = (
        db.table("rounds")
        .update({"duration_seconds": new_duration})
        .eq("id", active["id"])
        .execute()
    )
    background_tasks.add_task(
        record_audit,
        db,
        action="round.extended",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"], "added_seconds": int(body.seconds)},
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "extend")
    return result.data[0]


@router.post("/extension-polls", response_model=RoundExtensionPollResponse, status_code=201)
def start_extension_poll(
    event_id: str,
    response: Response,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Ask checked-in attendees whether the current round should be extended.

    The poll is intentionally fixed to 2/3/5 minutes. If 80% of the checked-in
    voters at poll creation vote for any extension, the backend automatically
    extends the round by the most-selected option. Only one successful poll can
    extend a round.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)
    if not active.get("started_at"):
        raise HTTPException(status_code=409, detail="Start the round before polling for more time")

    existing = _active_extension_poll(db, event_id, active["id"])
    if existing:
        response.status_code = 200
        return _extension_poll_response(db, existing)

    prior = (
        db.table("round_extension_polls")
        .select("*")
        .eq("event_id", event_id)
        .eq("round_id", active["id"])
        .eq("status", "extended")
        .limit(1)
        .execute()
        .data
        or []
    )
    if prior:
        raise HTTPException(status_code=409, detail="This round has already been extended")

    eligible_count = len(_eligible_extension_voters(db, event_id))
    if eligible_count == 0:
        raise HTTPException(status_code=409, detail="No checked-in attendees can vote")

    poll = (
        db.table("round_extension_polls")
        .insert(
            {
                "event_id": event_id,
                "round_id": active["id"],
                "status": "active",
                "eligible_count": eligible_count,
                "threshold_percent": EXTENSION_POLL_THRESHOLD_PERCENT,
                "selected_seconds": None,
                "resolved_at": None,
            }
        )
        .execute()
        .data[0]
    )
    background_tasks.add_task(
        record_audit,
        db,
        action="round.extension_poll_started",
        entity_type="round_extension_poll",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=poll["id"],
        metadata={
            "round_number": active["round_number"],
            "eligible_count": eligible_count,
            "threshold_percent": EXTENSION_POLL_THRESHOLD_PERCENT,
        },
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "extension_poll_started")
    return _extension_poll_response(db, poll)


@router.post("/extension-polls/{poll_id}/vote", response_model=RoundExtensionPollResponse)
def vote_extension_poll(
    event_id: str,
    poll_id: str,
    body: RoundExtensionVoteRequest,
    background_tasks: BackgroundTasks,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Vote on the active extension poll. One vote per attendee, editable while open."""
    attendee = _fetch_my_attendee(db, event_id, user.id)
    if attendee["status"] != "arrived":
        raise HTTPException(status_code=403, detail="Only checked-in attendees can vote")
    active = _fetch_active_round(db, event_id)
    polls = (
        db.table("round_extension_polls")
        .select("*")
        .eq("event_id", event_id)
        .eq("round_id", active["id"])
        .eq("id", poll_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not polls:
        raise HTTPException(status_code=404, detail="Poll not found")
    poll = polls[0]
    if poll["status"] != "active":
        return _extension_poll_response(db, poll, attendee["id"])

    existing = (
        db.table("round_extension_votes")
        .select("*")
        .eq("poll_id", poll_id)
        .eq("attendee_id", attendee["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    payload = {
        "poll_id": poll_id,
        "event_id": event_id,
        "round_id": active["id"],
        "attendee_id": attendee["id"],
        "seconds": int(body.seconds),
    }
    if existing:
        db.table("round_extension_votes").update(payload).eq("id", existing[0]["id"]).execute()
    else:
        db.table("round_extension_votes").insert(payload).execute()

    poll = _resolve_extension_poll_if_ready(
        db,
        event_id,
        poll,
        background_tasks,
        actor_user_id=user.id,
    )
    return _extension_poll_response(db, poll, attendee["id"])


@router.post("/end", response_model=RoundResponse)
def end_round(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("rounds")
        .update({"status": "completed", "ended_at": now})
        .eq("id", active["id"])
        .execute()
    )
    background_tasks.add_task(
        record_audit,
        db,
        action="round.ended",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"]},
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "round_end")
    return result.data[0]


@router.post("/pause", response_model=RoundResponse)
def pause_round(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Freeze the active round's countdown (e.g. for a host announcement).

    Sets paused_at=now. The effective end shifts forward by the paused span on
    resume, so no round time is lost. Idempotent: pausing an already-paused round
    is a no-op that returns the current state.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)
    if active.get("paused_at"):
        return active  # already paused — idempotent
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("rounds")
        .update({"paused_at": now})
        .eq("id", active["id"])
        .execute()
    )
    background_tasks.add_task(
        record_audit,
        db,
        action="round.paused",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"]},
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "pause")
    return result.data[0]


@router.post("/resume", response_model=RoundResponse)
def resume_round(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Resume a paused round, banking the paused span into total_paused_seconds
    so the timer picks up exactly where it left off. Idempotent: resuming a
    running round is a no-op."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)
    paused_at = active.get("paused_at")
    if not paused_at:
        return active  # not paused — idempotent
    elapsed = int((datetime.now(timezone.utc) - _parse_iso(paused_at)).total_seconds())
    new_total = int(active.get("total_paused_seconds") or 0) + max(0, elapsed)
    result = (
        db.table("rounds")
        .update({"paused_at": None, "total_paused_seconds": new_total})
        .eq("id", active["id"])
        .execute()
    )
    background_tasks.add_task(
        record_audit,
        db,
        action="round.resumed",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"], "total_paused_seconds": new_total},
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "resume")
    return result.data[0]


@router.post("/cancel", response_model=RoundCancelResponse)
def cancel_round(
    event_id: str,
    background_tasks: BackgroundTasks,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Roll back a mistakenly published round (REQ-RT-02).

    Unlike /end (which marks the round completed and keeps it in history), cancel
    DELETES the active round and its assignments + icebreakers so the bad seating
    leaves no trace — it never happened, and it never pollutes pairing history or
    future planning. Attendee phones re-fetch /live and fall back to between-rounds.
    The freed round_number is reused by the next start.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    active = _fetch_active_round(db, event_id)  # 404 if nothing to cancel

    # Count what we're wiping for the audit trail (UUIDs/counts only, no PII).
    seated_count = len(
        db.table("table_assignments").select("id").eq("round_id", active["id"]).execute().data or []
    )

    # Delete children first — robust whether or not ON DELETE CASCADE is present.
    db.table("icebreakers").delete().eq("round_id", active["id"]).execute()
    db.table("table_assignments").delete().eq("round_id", active["id"]).execute()
    db.table("rounds").delete().eq("id", active["id"]).execute()

    background_tasks.add_task(
        record_audit,
        db,
        action="round.cancelled",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"], "seated_count": seated_count},
    )
    background_tasks.add_task(broadcast_event_changed, event_id, "cancel")
    return RoundCancelResponse(event_id=event_id, round_number=active["round_number"])


@router.get("/run-sheet", response_model=RunSheet)
def get_run_sheet(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Pre-generate the WHOLE event's seating as a printable backup (REQ: event-day
    resilience). Plans every round at once from a clean slate so the organizer has a
    paper fallback if the app dies mid-event.

    Built over the people already arrived; before doors (fewer than 3 arrived) it
    falls back to the registered crowd so the sheet is useful as pre-event insurance.
    Caveat the UI states: it assumes these are the people who show up.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

    pool = _arrived_pool(db, event_id)
    basis = "arrived"
    if len(pool) < 3:
        rows = (
            db.table("attendees")
            .select("*")
            .eq("event_id", event_id)
            .neq("status", "left")
            .execute()
            .data
            or []
        )
        pool = [a for a in rows if (a.get("tag") or "attendee") not in NON_SEATED_TAGS]
        basis = "registered"

    num_tables, seats = event["num_tables"], event["seats_per_table"]
    names = {str(a["id"]): a["name"] for a in pool}
    ids = sorted(str(a["id"]) for a in pool)

    base = RunSheet(
        event_name=event["name"],
        basis=basis,
        num_tables=num_tables,
        seats_per_table=seats,
        total_people=len(ids),
        rounds=[],
    )
    if len(ids) < 3:
        return base  # not enough people to seat yet — empty sheet, no error

    intents = _meeting_intents(db, event_id, set(ids))
    horizon = _resolve_horizon(event, len(ids), 1)  # full plan from round 1
    min_size, max_size = _table_bounds(event)
    try:
        # Clean slate (no pairing history) — this is the canonical plan for the night.
        result = plan_rounds(ids, {}, num_tables, seats, horizon, intents=intents,
                             min_size=min_size, max_size=max_size)
    except RotationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    topics = event.get("round_topics") or []
    rounds_out: list[RunSheetRound] = []
    for idx, seating in enumerate(result.rounds):
        by_table: dict[int, list[str]] = {}
        for aid, table_number in seating.items():
            by_table.setdefault(table_number, []).append(names.get(aid, "—"))
        tables = [
            RunSheetTable(table_number=t, people=sorted(people))
            for t, people in sorted(by_table.items())
        ]
        theme = topics[idx] if idx < len(topics) and topics[idx] else None
        rounds_out.append(RunSheetRound(round_number=idx + 1, theme=theme, tables=tables))

    base.rounds = rounds_out
    return base


@router.get("/current", response_model=RoundWithAssignmentsResponse)
def get_current_round(event_id: str, db: Client = Depends(get_supabase)):
    """Active round + all table assignments — powers the organizer grid view."""
    round_data = dict(_fetch_active_round(db, event_id))
    assignments = (
        db.table("table_assignments")
        .select("*")
        .eq("round_id", round_data["id"])
        .execute()
    )
    round_data["assignments"] = assignments.data or []
    round_data["extension_poll"] = _latest_extension_poll_response(db, event_id, round_data["id"])
    return round_data


@router.get(
    "/{round_id}/tables/{table_number}",
    response_model=list[TableAssignmentResponse],
)
def get_table(
    event_id: str,
    round_id: str,
    table_number: int,
    db: Client = Depends(get_supabase),
):
    """All attendee assignments at one table — powers the attendee Live Dashboard."""
    result = (
        db.table("table_assignments")
        .select("*")
        .eq("event_id", event_id)
        .eq("round_id", round_id)
        .eq("table_number", table_number)
        .execute()
    )
    return result.data or []
