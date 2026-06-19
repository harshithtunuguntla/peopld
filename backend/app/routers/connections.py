import logging

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import ORGANIZER_ROLE, AuthUser, fetch_event_or_404, get_current_user
from app.models.schemas import ConnectionEntry, ConnectionsResponse

router = APIRouter(
    prefix="/events/{event_id}/attendees/{attendee_id}/connections",
    tags=["connections"],
)
logger = logging.getLogger(__name__)


@router.get("", response_model=ConnectionsResponse)
def get_connections(
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

    return build_connection_entries(db, event, attendee.data[0])


def build_connection_entries(db: Client, event: dict, attendee: dict) -> ConnectionsResponse:
    """The Rolodex for one attendee at one event: everyone they sat with, with
    likes/notes/shared-interests folded in. Pure data assembly (no auth) so it
    can be reused for the cross-event /me/connections aggregation.
    """
    event_id = str(event["id"])
    attendee_id = str(attendee["id"])

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

    # Likes both directions (one query each): who I liked, and who liked me.
    likes = _optional_signal_rows(
        lambda: db.table("connection_likes").select("*").eq("event_id", event_id).execute().data,
        table_name="connection_likes",
        event_id=event_id,
    )
    i_liked = {str(l["liked_attendee_id"]) for l in likes if str(l["liker_attendee_id"]) == str(attendee_id)}
    liked_me = {str(l["liker_attendee_id"]) for l in likes if str(l["liked_attendee_id"]) == str(attendee_id)}

    # My private notes about people, keyed by target. (One query.)
    notes = _optional_signal_rows(
        lambda: (
            db.table("connection_notes")
            .select("target_attendee_id, note")
            .eq("event_id", event_id)
            .eq("author_attendee_id", str(attendee_id))
            .execute()
            .data
        ),
        table_name="connection_notes",
        event_id=event_id,
    )
    notes_by_target = {str(n["target_attendee_id"]): n["note"] for n in notes}

    # People I've explicitly saved (bookmarked) — my shortlist, for the "Saved"
    # filter. Owner-private. (One query.)
    bookmarks = _optional_signal_rows(
        lambda: (
            db.table("connection_bookmarks")
            .select("target_attendee_id")
            .eq("event_id", event_id)
            .eq("owner_attendee_id", str(attendee_id))
            .execute()
            .data
        ),
        table_name="connection_bookmarks",
        event_id=event_id,
    )
    saved_ids = {str(b["target_attendee_id"]) for b in bookmarks}

    # My interests, for highlighting what each connection and I have in common.
    my_interest_set = {str(t).casefold() for t in (attendee.get("interests") or [])}

    entries: list[ConnectionEntry] = []
    people_met: set = set()
    for a in all_assignments:
        if str(a["attendee_id"]) == attendee_id:
            continue
        if (a["round_id"], a["table_number"]) not in my_tables:
            continue
        profile = profiles.get(a["attendee_id"])
        if not profile:
            continue
        other_id = str(a["attendee_id"])
        liked = other_id in i_liked
        their_interests = [str(t) for t in (profile.get("interests") or [])]
        shared = [t for t in their_interests if t.casefold() in my_interest_set]
        entries.append(
            ConnectionEntry(
                attendee_id=a["attendee_id"],
                name=profile["name"],
                role=profile["role"],
                company=profile.get("company"),
                looking_for=profile.get("looking_for"),
                linkedin_url=profile.get("linkedin_url"),
                website_url=profile.get("website_url"),
                avatar_url=profile.get("avatar_url"),
                interests=their_interests,
                shared_interests=shared,
                note=notes_by_target.get(other_id),
                round_number=round_numbers.get(a["round_id"], 0),
                table_number=a["table_number"],
                liked=liked,
                mutual=liked and other_id in liked_me,
                saved=other_id in saved_ids,
            )
        )
        people_met.add(a["attendee_id"])

    entries.sort(key=lambda e: (e.round_number, e.table_number))

    return ConnectionsResponse(
        total_people_met=len(people_met),
        rounds_count=len({rid for rid, _ in my_tables}),
        matches_count=sum(1 for e in entries if e.mutual),
        connections=entries,
    )


def _optional_signal_rows(load, *, table_name: str, event_id: str) -> list[dict]:
    """Best-effort read for auxiliary rolodex signals.

    The core rolodex is table assignments + attendee profiles. Likes, notes, and
    bookmarks are useful polish, but an out-of-date local DB should not turn the
    whole connections page into a 500.
    """
    try:
        return load() or []
    except Exception:
        logger.warning("optional rolodex signal unavailable", extra={"table": table_name, "event_id": event_id})
        return []
