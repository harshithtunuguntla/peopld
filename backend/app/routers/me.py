from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_profile_defaults, get_current_user, upsert_user_profile
from app.models.schemas import (
    MyConnectionCard,
    MyConnectionEventRef,
    MyConnectionsPage,
    MyProfileResponse,
    MyProfileUpdate,
)
from app.routers.connections import build_connection_entries

router = APIRouter(prefix="/me", tags=["me"])


def _matches_query(q: str, *fields) -> bool:
    """Every whitespace-token of `q` must appear (case-insensitively) somewhere in
    the given fields. Empty query matches everything."""
    terms = q.lower().split()
    if not terms:
        return True
    hay = " ".join(str(f).lower() for f in fields if f)
    return all(t in hay for t in terms)


@router.get("/profile", response_model=MyProfileResponse)
def get_my_profile(
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The caller's global profile — one per signed-in user, reused as the
    prefill for every event they join. `complete` tells the frontend whether to
    show the mandatory first-login setup gate."""
    return MyProfileResponse(**fetch_profile_defaults(db, user.id))


@router.put("/profile", response_model=MyProfileResponse)
def update_my_profile(
    payload: MyProfileUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Create or update the caller's global profile (upsert by user_id)."""
    fields = {
        "name": payload.name,
        "role": payload.role,
        "company": payload.company,
        "description": payload.description,
        "looking_for": payload.looking_for,
        "linkedin_url": payload.linkedin_url,
        "website_url": payload.website_url,
        "interests": payload.interests,
        "avatar_url": payload.avatar_url,
    }
    upsert_user_profile(db, user.id, fields)
    return MyProfileResponse(**fields, complete=True)


@router.get("/connections", response_model=MyConnectionsPage)
def my_connections(
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    q: str = Query("", max_length=100),
    event: Optional[str] = Query(None),  # event_id to filter to (None / "all" = every event)
    rel: str = Query("all"),             # all | met | matches | liked | saved
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The caller's cross-event Rolodex — everyone they've met across every event.

    Server-paginated: stats and facet counts are computed over the WHOLE history,
    but only one page of cards is returned, so the payload stays bounded no matter
    how many events the caller racks up. Filtering (relationship + event) and search
    run here too, so pagination stays consistent with what's shown. Identity is the
    JWT's user_id on the caller's attendee rows, never the URL.
    """
    my_attendees = (
        db.table("attendees").select("*").eq("user_id", user.id).execute().data or []
    )
    if not my_attendees:
        return MyConnectionsPage(page=page, limit=limit)

    # Load just the events the caller belongs to (one query).
    event_ids = list({str(a["event_id"]) for a in my_attendees})
    events = (
        db.table("events").select("*").in_("id", event_ids).execute().data or []
    )
    events_by_id = {str(e["id"]): e for e in events}

    # Build ONE deduped card per (event, person), merging the rounds we shared and
    # OR-ing the relationship flags — the grouping that used to live in the frontend.
    cards_map: dict[tuple[str, str], MyConnectionCard] = {}
    for attendee in my_attendees:
        ev = events_by_id.get(str(attendee["event_id"]))
        if not ev:
            continue
        result = build_connection_entries(db, ev, attendee, include_co_attendees=True)
        for c in result.connections:
            key = (str(ev["id"]), str(c.attendee_id))
            card = cards_map.get(key)
            if card is None:
                cards_map[key] = MyConnectionCard(
                    attendee_id=c.attendee_id,
                    name=c.name,
                    role=c.role,
                    company=c.company,
                    looking_for=c.looking_for,
                    linkedin_url=c.linkedin_url,
                    website_url=c.website_url,
                    avatar_url=c.avatar_url,
                    interests=c.interests,
                    shared_interests=c.shared_interests,
                    note=c.note,
                    rounds=[c.round_number] if (c.met and c.round_number) else [],
                    met=c.met,
                    wanted=c.wanted,
                    wants_me=c.wants_me,
                    liked=c.liked,
                    mutual=c.mutual,
                    saved=c.saved,
                    event_id=ev["id"],
                    event_name=ev["name"],
                    event_date=ev["date"],
                )
            else:
                if c.met and c.round_number and c.round_number not in card.rounds:
                    card.rounds.append(c.round_number)
                card.met = card.met or c.met
                card.wanted = card.wanted or c.wanted
                card.wants_me = card.wants_me or c.wants_me
                card.liked = card.liked or c.liked
                card.mutual = card.mutual or c.mutual
                card.saved = card.saved or c.saved
                if not card.note and c.note:
                    card.note = c.note

    cards = list(cards_map.values())

    # Stats + facet counts over the WHOLE set (so chips/headline don't change as you
    # page). "met" counts only people you actually shared a table with.
    rel_counts = {
        "all": len(cards),
        "met": sum(1 for c in cards if c.met),
        "matches": sum(1 for c in cards if c.mutual),
        "liked": sum(1 for c in cards if c.liked),
        "saved": sum(1 for c in cards if c.saved),
    }
    ev_refs = sorted(
        {
            str(c.event_id): MyConnectionEventRef(id=c.event_id, name=c.event_name, date=c.event_date)
            for c in cards
        }.values(),
        key=lambda e: str(e.date),
        reverse=True,
    )

    # Filter (relationship + event + search), then sort matches → met → name.
    def rel_ok(c: MyConnectionCard) -> bool:
        return {
            "met": c.met,
            "matches": c.mutual,
            "liked": c.liked,
            "saved": c.saved,
        }.get(rel, True)

    def event_ok(c: MyConnectionCard) -> bool:
        return event in (None, "", "all") or str(c.event_id) == event

    filtered = [
        c
        for c in cards
        if rel_ok(c)
        and event_ok(c)
        and _matches_query(q, c.name, c.role, c.company, c.looking_for, c.note, *(c.interests or []))
    ]
    filtered.sort(key=lambda c: (not c.mutual, not c.met, c.name.lower()))

    total = len(filtered)
    start = (page - 1) * limit
    return MyConnectionsPage(
        total_people_met=len({str(c.attendee_id) for c in cards if c.met}),
        events_count=len({str(c.event_id) for c in cards}),
        # Unique mutual (event, person) pairs — same person matched at two events
        # counts for each; cards are already unique per (event, person).
        matches_count=sum(1 for c in cards if c.mutual),
        rel_counts=rel_counts,
        events=list(ev_refs),
        page=page,
        limit=limit,
        total=total,
        total_pages=max(1, ceil(total / limit)),
        connections=filtered[start : start + limit],
    )
