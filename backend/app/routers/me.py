from fastapi import APIRouter, Depends
from supabase import Client

from app.database import get_supabase
from app.deps import (
    AuthUser,
    _materialize_pending_invitations,
    fetch_profile_defaults,
    get_admin_context,
    get_current_user,
    upsert_user_profile,
)
from app.models.schemas import (
    MyConnectionEntry,
    MyConnectionsResponse,
    MyProfileResponse,
    MyProfileUpdate,
    OrganizationMembership,
    UserContextResponse,
)
from app.routers.connections import build_connection_entries

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/context", response_model=UserContextResponse)
def get_my_context(
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Role resolution endpoint — called after every sign-in to determine where
    to route the user (admin dashboard, organizer console, or attendee home).

    Also materializes any pending email invitations: if the user was invited
    while they had no Supabase account, the invitation is converted into a real
    organization_members row here, idempotently.
    """
    # Accept any pending invitations sent to this email before they had an account.
    _materialize_pending_invitations(user, db)

    ctx = get_admin_context(user, db)

    memberships = [
        OrganizationMembership(
            organization_id=m.organization_id,
            organization_name=m.organization_name,
            role=m.role,
        )
        for m in ctx.memberships
    ]

    if ctx.is_platform_admin:
        platform_role = "super_admin"
        default_admin_url = "/admin"
    elif memberships:
        platform_role = None
        default_admin_url = "/organizer/dashboard"
    else:
        platform_role = None
        default_admin_url = None

    return UserContextResponse(
        user_id=user.id,
        email=user.email,
        platform_role=platform_role,
        memberships=memberships,
        default_admin_url=default_admin_url,
    )


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
        # Cross-event rolodex includes the whole room you were in, not just the
        # people a round happened to seat you with.
        result = build_connection_entries(db, event, attendee, include_co_attendees=True)
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
        # "met" counts only people you actually shared a table with — co-attendees
        # and picks you never sat with are surfaced but don't inflate this number.
        total_people_met=len({str(e.attendee_id) for e in entries if e.met}),
        events_count=len(events_with_people),
        # Unique mutual people per event (dedupe by event + person), so meeting the
        # same match in two rounds counts once, while the same person matched at
        # two different events counts for each event.
        matches_count=len({(str(e.event_id), str(e.attendee_id)) for e in entries if e.mutual}),
        connections=entries,
    )
