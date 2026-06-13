import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.algorithm import (
    PairCounts,
    RotationError,
    draft_snapshot_hash,
    generate_rotation,
)
from app.audit import record_audit
from app.database import get_supabase
from app.deps import fetch_event_or_404, get_current_organizer_id, require_event_owner
from app.models.schemas import (
    RoundDraftResponse,
    RoundResponse,
    RoundWithAssignmentsResponse,
    TableAssignmentResponse,
)

logger = logging.getLogger("app.rounds")

router = APIRouter(prefix="/events/{event_id}/rounds", tags=["rounds"])


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


def _has_active_round(db: Client, event_id: str) -> bool:
    result = (
        db.table("rounds")
        .select("id")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _fetch_draft(db: Client, event_id: str) -> dict | None:
    result = (
        db.table("round_drafts").select("*").eq("event_id", event_id).limit(1).execute()
    )
    return result.data[0] if result.data else None


def _arrived_pool(db: Client, event_id: str) -> list[dict]:
    """Only status='arrived' attendees are ever seated (design decision #1)."""
    result = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "arrived")
        .execute()
    )
    return result.data or []


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


def _next_round_number(db: Client, event_id: str) -> int:
    rounds = db.table("rounds").select("*").eq("event_id", event_id).execute().data or []
    return max((r["round_number"] for r in rounds), default=0) + 1


def _build_draft_row(db: Client, event: dict, event_id: str) -> tuple[dict, dict[str, dict]]:
    """Generate a seating draft from the current arrived pool.

    Returns (draft row ready to store, attendee lookup for the preview).
    Raises 422 with an organizer-readable message when no valid seating exists.
    """
    pool = _arrived_pool(db, event_id)
    arrived_ids = [str(a["id"]) for a in pool]
    try:
        rotation = generate_rotation(
            arrived_ids,
            _pair_counts(db, event_id),
            num_tables=event["num_tables"],
            seats_per_table=event["seats_per_table"],
        )
    except RotationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    row = {
        "event_id": event_id,
        "round_number": _next_round_number(db, event_id),
        "duration_seconds": event["default_round_duration_seconds"],
        "assignments": [
            {"attendee_id": attendee_id, "table_number": table_number}
            for attendee_id, table_number in rotation.tables.items()
        ],
        "arrived_hash": draft_snapshot_hash(
            arrived_ids, event["num_tables"], event["seats_per_table"]
        ),
        "repeat_pairings": rotation.repeat_pairings,
    }
    return row, {str(a["id"]): a for a in pool}


def _draft_response(draft: dict, attendees_by_id: dict[str, dict]) -> dict:
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
        "created_at": draft["created_at"],
    }


@router.post("/start", response_model=RoundDraftResponse, status_code=201)
async def start_round(
    event_id: str,
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

    record_audit(
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
    return _draft_response(stored, attendees_by_id)


@router.post("/regenerate", response_model=RoundDraftResponse)
async def regenerate_draft(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Replace the pending draft with a fresh one (re-reads the arrived pool)."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    draft = _fetch_draft(db, event_id)
    if not draft:
        raise HTTPException(status_code=404, detail="No draft to regenerate — start a round first")

    row, attendees_by_id = _build_draft_row(db, event, event_id)
    changes = {k: row[k] for k in
               ("round_number", "duration_seconds", "assignments", "arrived_hash", "repeat_pairings")}
    updated = db.table("round_drafts").update(changes).eq("id", draft["id"]).execute().data[0]

    record_audit(
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
    return _draft_response(updated, attendees_by_id)


@router.get("/draft", response_model=RoundDraftResponse)
async def get_draft(
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
    return _draft_response(draft, {str(a["id"]): a for a in attendees})


@router.post("/publish", response_model=RoundWithAssignmentsResponse, status_code=201)
async def publish_round(
    event_id: str,
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
        raise HTTPException(status_code=404, detail="No draft to publish — start a round first")
    if _has_active_round(db, event_id):
        raise HTTPException(status_code=409, detail="End the current round first")

    pool_ids = [str(a["id"]) for a in _arrived_pool(db, event_id)]
    current_hash = draft_snapshot_hash(
        pool_ids, event["num_tables"], event["seats_per_table"]
    )
    if current_hash != draft["arrived_hash"]:
        raise HTTPException(
            status_code=409,
            detail="Attendance or table settings changed since this preview — regenerate the draft",
        )

    now = datetime.now(timezone.utc).isoformat()
    round_row = (
        db.table("rounds")
        .insert(
            {
                "event_id": event_id,
                "round_number": _next_round_number(db, event_id),
                "duration_seconds": draft["duration_seconds"],
                "started_at": now,
                "ended_at": None,
                "status": "active",
            }
        )
        .execute()
        .data[0]
    )

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

    record_audit(
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
    result = dict(round_row)
    result["assignments"] = assignments
    return result


@router.post("/end", response_model=RoundResponse)
async def end_round(
    event_id: str,
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
    record_audit(
        db,
        action="round.ended",
        entity_type="round",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=active["id"],
        metadata={"round_number": active["round_number"]},
    )
    return result.data[0]


@router.get("/current", response_model=RoundWithAssignmentsResponse)
async def get_current_round(event_id: str, db: Client = Depends(get_supabase)):
    """Active round + all table assignments — powers the organizer grid view."""
    round_data = dict(_fetch_active_round(db, event_id))
    assignments = (
        db.table("table_assignments")
        .select("*")
        .eq("round_id", round_data["id"])
        .execute()
    )
    round_data["assignments"] = assignments.data or []
    return round_data


@router.get(
    "/{round_id}/tables/{table_number}",
    response_model=list[TableAssignmentResponse],
)
async def get_table(
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
