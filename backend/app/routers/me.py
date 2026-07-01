from datetime import datetime, timezone
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.database import get_supabase
from app.deps import AuthUser, fetch_profile_defaults, get_current_user, upsert_user_profile
from app.models.schemas import (
    ManualConnectionCreate,
    ManualConnectionResponse,
    ManualConnectionUpdate,
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
        "phone": payload.phone,
        "phone_dial_code": payload.phone_dial_code or "+91",
        "phone_visible": payload.phone_visible,
        "instagram": payload.instagram,
        "twitter": payload.twitter,
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
    # NB: don't early-return on no attendees — a caller who has only manually-added
    # connections (never attended an event) still has a rolodex to show.

    # Load just the events the caller belongs to (one query).
    event_ids = list({str(a["event_id"]) for a in my_attendees})
    events = (
        (db.table("events").select("*").in_("id", event_ids).execute().data or [])
        if event_ids
        else []
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
                    phone=c.phone,
                    phone_dial_code=c.phone_dial_code,
                    instagram=c.instagram,
                    twitter=c.twitter,
                    email=c.email,
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

    # Merge in the caller's manually-added connections — people they jotted down
    # (ideally by voice) rather than sat with. User-owned and cross-event; the only
    # editable/deletable cards. They aren't "met" (never shared a table).
    manual_rows = (
        db.table("manual_connections").select("*").eq("owner_user_id", user.id).execute().data or []
    )
    if manual_rows:
        # Resolve "met at" event labels — reuse the events already loaded, then fetch
        # any extras (a connection tagged with an event in one query).
        missing = list(
            {
                str(m["event_id"])
                for m in manual_rows
                if m.get("event_id") and str(m["event_id"]) not in events_by_id
            }
        )
        if missing:
            extra = db.table("events").select("*").in_("id", missing).execute().data or []
            for e in extra:
                events_by_id[str(e["id"])] = e
        for m in manual_rows:
            ev = events_by_id.get(str(m["event_id"])) if m.get("event_id") else None
            cards.append(
                MyConnectionCard(
                    attendee_id=m["id"],
                    name=m.get("name") or "",
                    role=m.get("role") or "",
                    company=m.get("company"),
                    linkedin_url=m.get("linkedin_url"),
                    website_url=m.get("website_url"),
                    phone=m.get("phone"),
                    phone_dial_code=m.get("phone_dial_code"),
                    instagram=m.get("instagram"),
                    twitter=m.get("twitter"),
                    email=m.get("email"),
                    note=m.get("note"),
                    met=False,
                    source="manual",
                    manual_id=m["id"],
                    met_context=m.get("met_context"),
                    event_id=ev["id"] if ev else None,
                    event_name=ev["name"] if ev else None,
                    event_date=ev["date"] if ev else None,
                )
            )

    # Stats + facet counts over the WHOLE set (so chips/headline don't change as you
    # page). "met" counts only people you actually shared a table with.
    rel_counts = {
        "all": len(cards),
        "met": sum(1 for c in cards if c.met),
        "matches": sum(1 for c in cards if c.mutual),
        "liked": sum(1 for c in cards if c.liked),
        "saved": sum(1 for c in cards if c.saved),
        "added": sum(1 for c in cards if c.source == "manual"),
    }
    ev_refs = sorted(
        {
            str(c.event_id): MyConnectionEventRef(id=c.event_id, name=c.event_name, date=c.event_date)
            for c in cards
            if c.event_id and c.event_name and c.event_date
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
            "added": c.source == "manual",
        }.get(rel, True)

    def event_ok(c: MyConnectionCard) -> bool:
        return event in (None, "", "all") or str(c.event_id) == event

    filtered = [
        c
        for c in cards
        if rel_ok(c)
        and event_ok(c)
        and _matches_query(
            q, c.name, c.role, c.company, c.looking_for, c.note, c.met_context, *(c.interests or [])
        )
    ]
    filtered.sort(key=lambda c: (not c.mutual, not c.met, c.name.lower()))

    total = len(filtered)
    start = (page - 1) * limit
    return MyConnectionsPage(
        total_people_met=len({str(c.attendee_id) for c in cards if c.met}),
        events_count=len({str(c.event_id) for c in cards if c.event_id}),
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


# --- Manually-added connections ("Add someone you met") ---


def _manual_response(row: dict) -> ManualConnectionResponse:
    return ManualConnectionResponse(
        id=row["id"],
        name=row.get("name") or "",
        role=row.get("role"),
        company=row.get("company"),
        phone=row.get("phone"),
        phone_dial_code=row.get("phone_dial_code"),
        email=row.get("email"),
        instagram=row.get("instagram"),
        twitter=row.get("twitter"),
        linkedin_url=row.get("linkedin_url"),
        website_url=row.get("website_url"),
        note=row.get("note"),
        met_context=row.get("met_context"),
        event_id=row.get("event_id"),
    )


def _clean(value):
    """Trim strings; treat empty as null so blank fields don't linger as ''."""
    if isinstance(value, str):
        return value.strip() or None
    return value


@router.post("/connections/manual", response_model=ManualConnectionResponse, status_code=201)
def create_manual_connection(
    payload: ManualConnectionCreate,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Add a person you met by hand. They land in your cross-event rolodex, tagged
    `source="manual"`, searchable and saveable like anyone you sat with."""
    data = payload.model_dump()
    name = (data.pop("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    event_id = data.pop("event_id")
    row = {"owner_user_id": user.id, "name": name, "event_id": str(event_id) if event_id else None}
    for key, value in data.items():
        row[key] = _clean(value)
    inserted = db.table("manual_connections").insert(row).execute().data
    return _manual_response(inserted[0])


@router.patch("/connections/manual/{manual_id}", response_model=ManualConnectionResponse)
def update_manual_connection(
    manual_id: str,
    payload: ManualConnectionUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Edit a manual connection. Owner-only (a stranger's id 404s, never leaks)."""
    existing = (
        db.table("manual_connections")
        .select("*")
        .eq("id", manual_id)
        .eq("owner_user_id", user.id)
        .limit(1)
        .execute()
        .data
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Name cannot be blank")
        changes["name"] = name
    if "event_id" in changes:
        changes["event_id"] = str(changes["event_id"]) if changes["event_id"] else None
    for key in list(changes):
        if key != "name":
            changes[key] = _clean(changes[key])
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    updated = (
        db.table("manual_connections")
        .update(changes)
        .eq("id", manual_id)
        .eq("owner_user_id", user.id)
        .execute()
        .data
    )
    return _manual_response(updated[0] if updated else existing[0])


@router.delete("/connections/manual/{manual_id}")
def delete_manual_connection(
    manual_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Remove a manual connection. Owner-only. Returns a JSON body (not 204) so the
    frontend's apiFetch — which always parses JSON — doesn't choke on an empty body."""
    existing = (
        db.table("manual_connections")
        .select("id")
        .eq("id", manual_id)
        .eq("owner_user_id", user.id)
        .limit(1)
        .execute()
        .data
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.table("manual_connections").delete().eq("id", manual_id).eq("owner_user_id", user.id).execute()
    return {"deleted": True}
