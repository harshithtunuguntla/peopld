from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import (
    AuthUser,
    get_admin_context,
    get_current_user,
    require_platform_admin,
)
from app.models.schemas import (
    AdminSummaryResponse,
    EventResponse,
    OrgCreateRequest,
    OrganizationResponse,
    PlatformAdminAddRequest,
    PlatformAdminResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: AuthUser = Depends(get_current_user), db: Client = Depends(get_supabase)):
    ctx = get_admin_context(user, db)
    require_platform_admin(ctx)
    return ctx


@router.get("/summary", response_model=AdminSummaryResponse)
def admin_summary(ctx=Depends(_require_admin), db: Client = Depends(get_supabase)):
    """Platform-level aggregate stats for the super-admin dashboard."""
    orgs = db.table("organizations").select("id", count="exact").execute()
    events = db.table("events").select("id, status", count="exact").execute()
    attendees = db.table("attendees").select("id", count="exact").execute()
    connections = (
        db.table("connection_likes")
        .select("id", count="exact")
        .execute()
    )

    events_data = events.data or []
    live = sum(1 for e in events_data if e.get("status") == "active")
    upcoming = sum(1 for e in events_data if e.get("status") == "upcoming")
    completed = sum(1 for e in events_data if e.get("status") == "ended")

    return AdminSummaryResponse(
        organizations_total=orgs.count or 0,
        events_total=events.count or 0,
        events_live=live,
        events_upcoming=upcoming,
        events_completed=completed,
        attendees_total=attendees.count or 0,
        connections_total=connections.count or 0,
    )


@router.get("/events", response_model=list[EventResponse])
def admin_events(ctx=Depends(_require_admin), db: Client = Depends(get_supabase)):
    """All events across the platform, most recent first."""
    rows = (
        db.table("events")
        .select("*")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    from app.deps import fetch_access_code
    result = []
    for r in rows:
        r["requires_code"] = fetch_access_code(db, str(r["id"])) is not None
        r["is_archived"] = bool(r.get("archived_at"))
        result.append(EventResponse(**r))
    return result


@router.get("/organizations", response_model=list[OrganizationResponse])
def admin_organizations(ctx=Depends(_require_admin), db: Client = Depends(get_supabase)):
    """All organizations on the platform."""
    orgs = (
        db.table("organizations")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    org_ids = [str(o["id"]) for o in orgs]
    member_rows = (
        db.table("organization_members")
        .select("organization_id")
        .in_("organization_id", org_ids)
        .execute()
        .data
        or []
    ) if org_ids else []
    counts: dict[str, int] = {}
    for row in member_rows:
        oid = str(row["organization_id"])
        counts[oid] = counts.get(oid, 0) + 1

    return [
        OrganizationResponse(
            id=o["id"],
            name=o["name"],
            created_by_user_id=o.get("created_by_user_id"),
            created_at=o["created_at"],
            member_count=counts.get(str(o["id"]), 0),
        )
        for o in orgs
    ]


@router.post("/organizations", response_model=OrganizationResponse, status_code=201)
def create_organization(body: OrgCreateRequest, ctx=Depends(_require_admin), db: Client = Depends(get_supabase)):
    """Create a new organization. The requesting platform admin becomes its first super_organizer."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Organization name cannot be empty")

    org = (
        db.table("organizations")
        .insert({"name": name, "created_by_user_id": ctx.user_id})
        .execute()
        .data[0]
    )
    org_id = str(org["id"])

    db.table("organization_members").insert({
        "organization_id": org_id,
        "user_id": ctx.user_id,
        "role": "super_organizer",
        "created_by_user_id": ctx.user_id,
    }).execute()

    return OrganizationResponse(
        id=org["id"],
        name=org["name"],
        created_by_user_id=org.get("created_by_user_id"),
        created_at=org["created_at"],
        member_count=1,
    )


@router.get("/platform-admins", response_model=list[PlatformAdminResponse])
def list_platform_admins(ctx=Depends(_require_admin), db: Client = Depends(get_supabase)):
    """List all platform admins."""
    rows = (
        db.table("platform_admins")
        .select("user_id, created_at")
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )
    user_ids = [str(r["user_id"]) for r in rows]
    if not user_ids:
        return []

    # Fetch emails from auth.users via the admin API
    emails: dict[str, str] = {}
    try:
        users_resp = db.auth.admin.list_users()
        for u in (users_resp or []):
            uid = str(u.id)
            if uid in user_ids:
                emails[uid] = u.email or ""
    except Exception:
        pass

    return [
        PlatformAdminResponse(
            user_id=r["user_id"],
            email=emails.get(str(r["user_id"])),
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post("/platform-admins", response_model=PlatformAdminResponse, status_code=201)
def add_platform_admin(
    body: PlatformAdminAddRequest,
    ctx=Depends(_require_admin),
    db: Client = Depends(get_supabase),
):
    """Grant platform admin rights to a user by email."""
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="Email is required")

    # Look up user by email
    target_user = None
    try:
        users_resp = db.auth.admin.list_users()
        for u in (users_resp or []):
            if (u.email or "").lower() == email:
                target_user = u
                break
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to look up user: {exc}") from exc

    if not target_user:
        raise HTTPException(status_code=404, detail=f"No account found for {email}")

    uid = str(target_user.id)
    existing = db.table("platform_admins").select("user_id").eq("user_id", uid).execute().data
    if existing:
        raise HTTPException(status_code=409, detail="User is already a platform admin")

    row = (
        db.table("platform_admins")
        .insert({"user_id": uid, "created_by_user_id": ctx.user_id})
        .execute()
        .data[0]
    )
    return PlatformAdminResponse(
        user_id=row["user_id"],
        email=target_user.email,
        created_at=row["created_at"],
    )


@router.delete("/platform-admins/{user_id}", status_code=204)
def remove_platform_admin(
    user_id: str,
    ctx=Depends(_require_admin),
    db: Client = Depends(get_supabase),
):
    """Revoke platform admin rights. Cannot remove yourself."""
    if user_id == ctx.user_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself as platform admin")

    db.table("platform_admins").delete().eq("user_id", user_id).execute()


@router.get("/activity")
def admin_activity(ctx=Depends(_require_admin), db: Client = Depends(get_supabase)):
    """Recent audit log entries for the super-admin activity feed."""
    rows = (
        db.table("audit_log")
        .select("*")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return {"entries": rows}
