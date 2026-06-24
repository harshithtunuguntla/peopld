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


def build_connection_entries(
    db: Client, event: dict, attendee: dict, *, include_co_attendees: bool = False
) -> ConnectionsResponse:
    """The Rolodex for one attendee at one event, with likes/notes/picks folded in.
    Pure data assembly (no auth) so it can be reused for the cross-event
    /me/connections aggregation.

    Surfaces three kinds of people:
      - **met** — we shared a table at least once (the classic rolodex). One entry
        per encounter (round+table); the frontend collapses by person.
      - **picks** — people I marked "want to meet" pre-event (meeting_intents),
        shown even if a round never sat us together, so a pick is never invisible.
      - **co-attendees** (only when `include_co_attendees`) — everyone else who
        checked in to this event, so "My connections" reflects the whole room you
        were in, not only the handful you were seated with.
    """
    event_id = str(event["id"])
    attendee_id = str(attendee["id"])

    # A few queries total regardless of event size — the join happens in memory.
    all_assignments = (
        db.table("table_assignments").select("*").eq("event_id", event_id).execute().data or []
    )
    rounds = db.table("rounds").select("*").eq("event_id", event_id).execute().data or []
    attendees = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []

    round_numbers = {r["id"]: r["round_number"] for r in rounds}
    profiles = {str(a["id"]): a for a in attendees}
    my_assignments = [a for a in all_assignments if str(a["attendee_id"]) == attendee_id]
    my_tables = {(m["round_id"], m["table_number"]) for m in my_assignments}

    # Likes both directions (one query): who I liked, and who liked me.
    likes = _optional_signal_rows(
        lambda: db.table("connection_likes").select("*").eq("event_id", event_id).execute().data,
        table_name="connection_likes",
        event_id=event_id,
    )
    i_liked = {str(l["liked_attendee_id"]) for l in likes if str(l["liker_attendee_id"]) == attendee_id}
    liked_me = {str(l["liker_attendee_id"]) for l in likes if str(l["liked_attendee_id"]) == attendee_id}

    # "Want to meet" picks both directions (one query): who I picked, who picked me.
    intents = _optional_signal_rows(
        lambda: db.table("meeting_intents").select("*").eq("event_id", event_id).execute().data,
        table_name="meeting_intents",
        event_id=event_id,
    )
    i_want = {str(i["liked_attendee_id"]) for i in intents if str(i["liker_attendee_id"]) == attendee_id}
    wants_me = {str(i["liker_attendee_id"]) for i in intents if str(i["liked_attendee_id"]) == attendee_id}

    # My private notes about people, keyed by target. (One query.)
    notes = _optional_signal_rows(
        lambda: (
            db.table("connection_notes")
            .select("target_attendee_id, note")
            .eq("event_id", event_id)
            .eq("author_attendee_id", attendee_id)
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
            .eq("owner_attendee_id", attendee_id)
            .execute()
            .data
        ),
        table_name="connection_bookmarks",
        event_id=event_id,
    )
    saved_ids = {str(b["target_attendee_id"]) for b in bookmarks}

    # My interests, for highlighting what each connection and I have in common.
    my_interest_set = {str(t).casefold() for t in (attendee.get("interests") or [])}

    def make_entry(other_id: str, round_number: int, table_number: int, met: bool) -> ConnectionEntry | None:
        profile = profiles.get(other_id)
        if not profile:
            return None
        liked = other_id in i_liked
        their_interests = [str(t) for t in (profile.get("interests") or [])]
        shared = [t for t in their_interests if t.casefold() in my_interest_set]
        return ConnectionEntry(
            attendee_id=profile["id"],
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
            round_number=round_number,
            table_number=table_number,
            met=met,
            wanted=other_id in i_want,
            wants_me=other_id in wants_me,
            liked=liked,
            mutual=liked and other_id in liked_me,
            saved=other_id in saved_ids,
        )

    entries: list[ConnectionEntry] = []
    people_met: set[str] = set()
    # 1) Met: one entry per shared encounter (round+table), like the original.
    for a in all_assignments:
        other_id = str(a["attendee_id"])
        if other_id == attendee_id:
            continue
        if (a["round_id"], a["table_number"]) not in my_tables:
            continue
        entry = make_entry(other_id, round_numbers.get(a["round_id"], 0), a["table_number"], met=True)
        if entry is None:
            continue
        entries.append(entry)
        people_met.add(other_id)

    # 2) Picks I never sat with, then 3) co-attendees who checked in — a single
    #    "not met" entry each, so each person appears exactly once beyond the met list.
    extra_ids: set[str] = set(i_want)
    if include_co_attendees:
        extra_ids |= {str(a["id"]) for a in attendees if a.get("status") == "arrived"}
    extra_ids -= people_met
    extra_ids.discard(attendee_id)
    for other_id in extra_ids:
        entry = make_entry(other_id, 0, 0, met=False)
        if entry is not None:
            entries.append(entry)

    # Met first (by round/table), then the rest by name — the frontend regroups by
    # person, so this is just a sensible default order.
    entries.sort(key=lambda e: (not e.met, e.round_number, e.table_number, e.name.lower()))

    return ConnectionsResponse(
        total_people_met=len(people_met),
        rounds_count=len({rid for rid, _ in my_tables}),
        # Count unique mutual PEOPLE, not entries (one row per encounter would
        # otherwise double-count a match met across two rounds).
        matches_count=len({str(e.attendee_id) for e in entries if e.mutual}),
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
