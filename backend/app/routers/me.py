from fastapi import APIRouter, Depends
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, get_current_user
from app.models.schemas import MyConnectionEntry, MyConnectionsResponse
from app.routers.connections import build_connection_entries

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/connections", response_model=MyConnectionsResponse)
def my_connections(
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The caller's cross-event Rolodex: everyone they've met across every event
    they've attended, each tagged with which event it came from. Identity is
    resolved from the JWT (the user_id on their attendee rows), never the URL.
    """
    my_attendees = (
        db.table("attendees").select("*").eq("user_id", user.id).execute().data or []
    )
    if not my_attendees:
        return MyConnectionsResponse(
            total_people_met=0, events_count=0, matches_count=0, connections=[]
        )

    # Load just the events the caller belongs to (one query).
    event_ids = list({str(a["event_id"]) for a in my_attendees})
    events = (
        db.table("events").select("*").in_("id", event_ids).execute().data or []
    )
    events_by_id = {str(e["id"]): e for e in events}

    entries: list[MyConnectionEntry] = []
    events_with_people: set[str] = set()
    for attendee in my_attendees:
        event = events_by_id.get(str(attendee["event_id"]))
        if not event:
            continue
        result = build_connection_entries(db, event, attendee)
        if not result.connections:
            continue
        events_with_people.add(str(event["id"]))
        for c in result.connections:
            entries.append(
                MyConnectionEntry(
                    **c.model_dump(),
                    event_id=event["id"],
                    event_name=event["name"],
                    event_date=event["date"],
                )
            )

    # Most recent events first, then by round order within an event.
    entries.sort(key=lambda e: (str(e.event_date), e.round_number, e.table_number), reverse=False)
    entries.reverse()

    return MyConnectionsResponse(
        total_people_met=len({str(e.attendee_id) for e in entries}),
        events_count=len(events_with_people),
        matches_count=sum(1 for e in entries if e.mutual),
        connections=entries,
    )
