from fastapi import APIRouter, Depends, HTTPException, Response
from supabase import Client

from app.audit import record_audit
from app.database import get_supabase
from app.deps import (
    AuthUser,
    code_matches,
    fetch_access_code,
    fetch_event_or_404,
    fetch_my_attendee,
    fetch_profile_defaults,
    fetch_room_code,
    get_current_organizer_id,
    get_current_user,
    require_event_owner,
    sync_user_profile_best_effort,
)
from app.models.schemas import (
    ArriveRequest,
    AttendeeCreate,
    AttendeeProfileDefaults,
    AttendeeResponse,
    AttendeeSelfUpdate,
    AttendeeUpdate,
    AttendeeWithAssignmentResponse,
    BulkCheckInResponse,
    WalkInCreate,
)

router = APIRouter(prefix="/events/{event_id}/attendees", tags=["attendees"])


def _fetch_attendee(db: Client, event_id: str, attendee_id: str) -> dict:
    result = (
        db.table("attendees")
        .select("*")
        .eq("id", attendee_id)
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Attendee not found")
    return result.data[0]


@router.post("", response_model=AttendeeResponse, status_code=201)
def register_attendee(
    event_id: str,
    body: AttendeeCreate,
    response: Response,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    event = fetch_event_or_404(db, event_id)

    # Dedupe: one registration per auth identity per event. Re-registering
    # returns the existing record (200, not 201) — even after the event ends,
    # so returning attendees can still reach their rolodex.
    existing = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if existing.data:
        response.status_code = 200
        return existing.data[0]

    if event["status"] == "ended":
        raise HTTPException(status_code=409, detail="Event has already ended")

    # Access-code gate (server-side enforcement — the verify-code endpoint is
    # only a UX pre-check). Open events have no code and always pass. Skipped
    # above for the dedupe path so already-registered users never get locked out.
    row = body.model_dump(mode="json")
    supplied_code = row.pop("access_code", None)  # never stored on the attendee
    if not code_matches(fetch_access_code(db, event_id), supplied_code):
        raise HTTPException(status_code=403, detail="Incorrect event code")

    # auto_arrive_on_register (event config, OFF by default) marks a registrant
    # arrived immediately. When off — the default — they stay "registered" until
    # the organizer checks them in (or they self-arrive with the room code), so
    # the door is a deliberate step rather than implied by registering.
    auto_arrive = bool(event.get("auto_arrive_on_register", False))

    row["event_id"] = event_id
    row["status"] = "arrived" if auto_arrive else "registered"
    row["user_id"] = user.id
    # Capture the account's sign-in email on the attendee row so the rolodex can
    # show it as a contact channel without a per-view auth lookup. Owner-scoped to
    # this event's connections; never surfaced on the public directory.
    row["email"] = user.email

    result = db.table("attendees").insert(row).execute()
    created = result.data[0]
    # Keep the one global profile in sync: if they corrected something while
    # joining (the registration form prefills FROM it), the fix flows back here
    # instead of only living on this one event's attendee row. Best-effort —
    # registration itself must succeed even if this side sync hiccups.
    sync_user_profile_best_effort(
        db,
        user.id,
        {
            "name": created.get("name"),
            "role": created.get("role"),
            "company": created.get("company"),
            "description": created.get("description"),
            "looking_for": created.get("looking_for"),
            "linkedin_url": created.get("linkedin_url"),
            "website_url": created.get("website_url"),
            "phone": created.get("phone"),
            "phone_dial_code": created.get("phone_dial_code"),
            "phone_visible": created.get("phone_visible", False),
            "instagram": created.get("instagram"),
            "twitter": created.get("twitter"),
            "interests": created.get("interests") or [],
            "avatar_url": created.get("avatar_url"),
        },
    )
    record_audit(
        db,
        action="attendee.registered",
        entity_type="attendee",
        actor_user_id=user.id,
        event_id=event_id,
        entity_id=created["id"],
        metadata={"auto_arrived": auto_arrive},
    )
    return created


@router.post("/walkin", response_model=AttendeeResponse, status_code=201)
def add_walkin(
    event_id: str,
    body: WalkInCreate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Organizer adds an attendee with no app account. Event owner only.

    Two uses, one endpoint (the body's `status` decides which):
      - day-of walk-in at the door → `arrived` (the default), seated like everyone
        else but with no live phone screen of their own;
      - pre-event guest/speaker → `registered`, on the list but not yet in the room.
    `tag` (attendee/speaker/host) can be set up front so a speaker is marked
    correctly from the start. Always has no `user_id`.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)

    row = body.model_dump(mode="json")  # carries name/role/… plus tag + status
    row["event_id"] = event_id
    row["user_id"] = None
    created = db.table("attendees").insert(row).execute().data[0]
    record_audit(
        db,
        action="attendee.walkin_added",
        entity_type="attendee",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=created["id"],
        metadata={"tag": created.get("tag"), "status": created.get("status")},
    )
    return created


@router.post("/check-in-all", response_model=BulkCheckInResponse)
def check_in_all(
    event_id: str,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """One-tap door action: mark every 'registered' attendee 'arrived'.

    Saves the organizer tapping each person at a busy door. Only touches
    registered people (never resurrects someone who 'left'). Event owner only.
    Declared before /{attendee_id} so the literal path isn't matched as an id.
    """
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    registered = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "registered")
        .execute()
        .data
        or []
    )
    for a in registered:
        db.table("attendees").update({"status": "arrived"}).eq("id", a["id"]).execute()
    if registered:
        record_audit(
            db,
            action="attendee.bulk_checked_in",
            entity_type="event",
            actor_user_id=organizer_id,
            event_id=event_id,
            entity_id=event_id,
            metadata={"count": len(registered)},
        )
    return BulkCheckInResponse(arrived=len(registered))


@router.get("/me/profile-defaults", response_model=AttendeeProfileDefaults)
def get_my_profile_defaults(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Reusable profile defaults for joining another event — the caller's saved
    global profile (`user_profiles`), or (for a user who registered before that
    table existed) derived from their most recent attendee row. Same single
    source as GET /me/profile, just shaped for the registration form."""
    fetch_event_or_404(db, event_id)
    defaults = fetch_profile_defaults(db, user.id)
    defaults.pop("complete", None)
    return AttendeeProfileDefaults(**defaults)


@router.get("/me", response_model=AttendeeResponse)
def get_my_registration(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The caller's own registration for this event, 404 if not registered.

    Lets the frontend detect an existing registration BEFORE showing the
    form. Declared before /{attendee_id} so 'me' isn't matched as an id.
    """
    fetch_event_or_404(db, event_id)
    result = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    return result.data[0]


@router.patch("/me", response_model=AttendeeResponse)
def update_my_registration(
    event_id: str,
    body: AttendeeSelfUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """An attendee edits their OWN profile (fix a typo'd link, add interests).

    Resolved from the JWT, so you can only ever edit yourself. Declared before
    /{attendee_id} so 'me' isn't matched as an id. Status is intentionally not
    editable here — only the organizer moves people between arrived/left.
    """
    fetch_event_or_404(db, event_id)
    me = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if not me.data:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    attendee = me.data[0]

    changes = body.model_dump(exclude_none=True)
    if not changes:
        return attendee

    updated = db.table("attendees").update(changes).eq("id", attendee["id"]).execute().data[0]
    # Same sync as registration: fixing a typo on this event's profile is a fix
    # to THE profile, not a fork — keep the global one current too. Best-effort,
    # same reasoning as registration: this self-edit must succeed regardless.
    sync_user_profile_best_effort(
        db,
        user.id,
        {
            "name": updated.get("name"),
            "role": updated.get("role"),
            "company": updated.get("company"),
            "description": updated.get("description"),
            "looking_for": updated.get("looking_for"),
            "linkedin_url": updated.get("linkedin_url"),
            "website_url": updated.get("website_url"),
            "phone": updated.get("phone"),
            "phone_dial_code": updated.get("phone_dial_code"),
            "phone_visible": updated.get("phone_visible", False),
            "instagram": updated.get("instagram"),
            "twitter": updated.get("twitter"),
            "interests": updated.get("interests") or [],
            "avatar_url": updated.get("avatar_url"),
        },
    )
    record_audit(
        db,
        action="attendee.profile_updated",
        entity_type="attendee",
        actor_user_id=user.id,
        event_id=event_id,
        entity_id=attendee["id"],
        metadata={"fields": sorted(changes.keys())},
    )
    return updated


@router.post("/me/arrive", response_model=AttendeeResponse)
def self_arrive(
    event_id: str,
    body: ArriveRequest,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Self-service day-of check-in: a pre-registered attendee types the ROOM code
    the organizer revealed in the room and flips themselves 'registered' ->
    'arrived', joining the seating pool.

    Resolved from the JWT, so you can only ever check yourself in. Declared before
    /{attendee_id} so the 'me' segment isn't matched as an id. The room code is a
    secret separate from the join code (deps.fetch_room_code) — never returned
    here, only verified — and the audit records the status change, never the code.
    """
    event = fetch_event_or_404(db, event_id)
    if event["status"] == "ended":
        raise HTTPException(status_code=409, detail="This event has already ended")

    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Register for this event first")

    # Idempotent: already in the room — a double-tap or stale screen is a no-op success.
    if me["status"] == "arrived":
        return me

    room_code = fetch_room_code(db, event_id)
    if not room_code:
        # No code set yet — check-in isn't open. (code_matches() would pass an
        # empty required code, so we must guard before calling it.)
        raise HTTPException(
            status_code=409, detail="Check-in isn't open yet — ask the host for the room code"
        )
    if not code_matches(room_code, body.room_code):
        raise HTTPException(status_code=403, detail="That room code isn't right")

    updated = (
        db.table("attendees").update({"status": "arrived"}).eq("id", me["id"]).execute().data[0]
    )
    record_audit(
        db,
        action="attendee.self_arrived",
        entity_type="attendee",
        actor_user_id=user.id,
        event_id=event_id,
        entity_id=me["id"],
        metadata={"from": me["status"]},  # 'registered' or 're-entry from left'; never the code
    )
    return updated


@router.get("/{attendee_id}", response_model=AttendeeWithAssignmentResponse)
def get_attendee(
    event_id: str,
    attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Attendee profile + current table assignment (if a round is active).

    Contains contact info, so restricted to the attendee themself or the
    event's organizer.
    """
    event = fetch_event_or_404(db, event_id)
    attendee = _fetch_attendee(db, event_id, attendee_id)

    is_organizer = str(event["organizer_id"]) == user.id
    is_self = attendee.get("user_id") is not None and str(attendee["user_id"]) == user.id
    if not (is_organizer or is_self):
        raise HTTPException(status_code=403, detail="Not allowed to view this attendee")

    result = dict(attendee)

    active_round = (
        db.table("rounds")
        .select("*")
        .eq("event_id", event_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if active_round.data:
        round_row = active_round.data[0]
        assignment = (
            db.table("table_assignments")
            .select("*")
            .eq("round_id", round_row["id"])
            .eq("attendee_id", attendee_id)
            .limit(1)
            .execute()
        )
        if assignment.data:
            result["current_table_number"] = assignment.data[0]["table_number"]
            result["current_round_id"] = round_row["id"]
            result["current_round_number"] = round_row["round_number"]

    return result


@router.patch("/{attendee_id}", response_model=AttendeeResponse)
def update_attendee(
    event_id: str,
    attendee_id: str,
    body: AttendeeUpdate,
    organizer_id: str = Depends(get_current_organizer_id),
    db: Client = Depends(get_supabase),
):
    """Organizer control panel — mark arrived/left, tag, or fix identity details
    (name/role/company/looking_for). Event owner only."""
    event = fetch_event_or_404(db, event_id)
    require_event_owner(event, organizer_id)
    attendee = _fetch_attendee(db, event_id, attendee_id)

    changes = body.model_dump(exclude_none=True)

    # Trim free-text edits; require non-blank identity, null-out cleared optionals.
    for key in ("name", "role", "company", "looking_for"):
        if key in changes and isinstance(changes[key], str):
            changes[key] = changes[key].strip()
    for key in ("name", "role"):
        if key in changes and not changes[key]:
            raise HTTPException(status_code=400, detail=f"{key.capitalize()} can't be empty")
    for key in ("company", "looking_for"):
        if changes.get(key) == "":
            changes[key] = None

    if not changes:
        return attendee

    result = db.table("attendees").update(changes).eq("id", attendee_id).execute()
    updated = result.data[0]
    # Status moves are logged precisely; other edits log only WHICH fields changed
    # (never the values) to keep PII out of the audit trail.
    if "status" in changes:
        action = "attendee.status_changed"
        metadata = {"from": attendee["status"], "to": updated["status"]}
    else:
        action = "attendee.updated"
        metadata = {"fields": sorted(changes.keys())}
    record_audit(
        db,
        action=action,
        entity_type="attendee",
        actor_user_id=organizer_id,
        event_id=event_id,
        entity_id=attendee_id,
        metadata=metadata,
    )
    return updated
