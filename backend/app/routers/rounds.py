from fastapi import APIRouter, HTTPException
from app.models.schemas import RoundResponse, TableAssignmentResponse
from app.database import supabase

router = APIRouter(prefix="/events/{event_id}/rounds", tags=["rounds"])


@router.post("/start", response_model=RoundResponse, status_code=201)
async def start_round(event_id: str):
    # Triggers: rotation algorithm → icebreaker generation (async)
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/end", response_model=RoundResponse)
async def end_round(event_id: str):
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/current", response_model=RoundResponse)
async def get_current_round(event_id: str):
    result = (
        supabase.table("rounds")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "active")
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No active round")
    return result.data


@router.get("/{round_id}/tables/{table_number}", response_model=list[TableAssignmentResponse])
async def get_table(event_id: str, round_id: str, table_number: int):
    result = (
        supabase.table("table_assignments")
        .select("*")
        .eq("round_id", round_id)
        .eq("table_number", table_number)
        .execute()
    )
    return result.data or []
