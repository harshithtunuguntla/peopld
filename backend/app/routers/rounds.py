from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import fetch_event_or_404, get_current_organizer_id, require_event_owner
from app.models.schemas import (
    RoundResponse,
    RoundWithAssignmentsResponse,
    TableAssignmentResponse,
)

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


@router.post("/start", response_model=RoundResponse, status_code=201)
async def start_round(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    # Step 4: rotation algorithm assigns tables, then triggers async icebreaker generation
    raise HTTPException(status_code=501, detail="Implemented in Step 4 (rotation algorithm)")


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
