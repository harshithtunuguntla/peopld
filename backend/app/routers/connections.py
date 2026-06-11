from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.models.schemas import ConnectionEntry, ConnectionsResponse

router = APIRouter(
    prefix="/events/{event_id}/attendees/{attendee_id}/connections",
    tags=["connections"],
)


@router.get("", response_model=ConnectionsResponse)
async def get_connections(
    event_id: str,
    attendee_id: str,
    db: Client = Depends(get_supabase),
):
    """Digital Rolodex — everyone this attendee sat with, grouped by round."""
    attendee = (
        db.table("attendees")
        .select("*")
        .eq("id", attendee_id)
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    if not attendee.data:
        raise HTTPException(status_code=404, detail="Attendee not found")

    my_assignments = (
        db.table("table_assignments")
        .select("*")
        .eq("event_id", event_id)
        .eq("attendee_id", attendee_id)
        .execute()
        .data
        or []
    )
    if not my_assignments:
        return ConnectionsResponse(total_people_met=0, rounds_count=0, connections=[])

    # 3 queries total regardless of event size — join happens in memory
    all_assignments = (
        db.table("table_assignments").select("*").eq("event_id", event_id).execute().data or []
    )
    rounds = db.table("rounds").select("*").eq("event_id", event_id).execute().data or []
    attendees = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []

    round_numbers = {r["id"]: r["round_number"] for r in rounds}
    profiles = {a["id"]: a for a in attendees}
    my_tables = {(m["round_id"], m["table_number"]) for m in my_assignments}

    entries: list[ConnectionEntry] = []
    people_met: set = set()
    for a in all_assignments:
        if a["attendee_id"] == attendee_id:
            continue
        if (a["round_id"], a["table_number"]) not in my_tables:
            continue
        profile = profiles.get(a["attendee_id"])
        if not profile:
            continue
        entries.append(
            ConnectionEntry(
                attendee_id=a["attendee_id"],
                name=profile["name"],
                role=profile["role"],
                whatsapp_number=profile.get("whatsapp_number"),
                round_number=round_numbers.get(a["round_id"], 0),
                table_number=a["table_number"],
            )
        )
        people_met.add(a["attendee_id"])

    entries.sort(key=lambda e: (e.round_number, e.table_number))

    return ConnectionsResponse(
        total_people_met=len(people_met),
        rounds_count=len({rid for rid, _ in my_tables}),
        connections=entries,
    )
