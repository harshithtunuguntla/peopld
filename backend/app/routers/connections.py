from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import ORGANIZER_ROLE, AuthUser, fetch_event_or_404, get_current_user
from app.models.schemas import ConnectionEntry, ConnectionsResponse

router = APIRouter(
    prefix="/events/{event_id}/attendees/{attendee_id}/connections",
    tags=["connections"],
)


@router.get("", response_model=ConnectionsResponse)
async def get_connections(
    event_id: str,
    attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Digital Rolodex — everyone this attendee sat with, grouped by round.

    Exposes tablemates' contact info, so it is restricted to the attendee
    themself or the event's organizer.
    """
    event = fetch_event_or_404(db, event_id)
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

    is_organizer = user.role == ORGANIZER_ROLE and str(event["organizer_id"]) == user.id
    is_self = (
        attendee.data[0].get("user_id") is not None
        and str(attendee.data[0]["user_id"]) == user.id
    )
    if not (is_organizer or is_self):
        raise HTTPException(status_code=403, detail="Not allowed to view these connections")

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
