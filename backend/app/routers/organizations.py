from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.audit import record_audit
from app.database import get_supabase
from app.deps import (
    AuthUser,
    AdminContext,
    get_current_user,
    get_admin_context,
    require_org_super_organizer,
    require_platform_admin,
)
from app.models.schemas import (
    OrgInvitationResponse,
    OrgMemberAddRequest,
    OrgMemberResponse,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _ctx(user: AuthUser = Depends(get_current_user), db: Client = Depends(get_supabase)) -> AdminContext:
    return get_admin_context(user, db)


# ── Members ───────────────────────────────────────────────────────────────────


@router.get("/{organization_id}/members", response_model=list[OrgMemberResponse])
def list_members(
    organization_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    ctx = get_admin_context(user, db)
    require_org_super_organizer(organization_id, ctx)

    rows = (
        db.table("organization_members")
        .select("user_id, role, created_at")
        .eq("organization_id", organization_id)
        .execute()
        .data
        or []
    )
    # Enrich with email + name from auth.users via Supabase admin API
    result = []
    for row in rows:
        uid = str(row["user_id"])
        try:
            auth_user = db.auth.admin.get_user_by_id(uid).user
            email = auth_user.email if auth_user else None
            name = (auth_user.user_metadata or {}).get("full_name") if auth_user else None
        except Exception:
            email = None
            name = None
        result.append(
            OrgMemberResponse(
                user_id=uid,
                email=email,
                name=name,
                role=row["role"],
                created_at=row["created_at"],
            )
        )
    return result


@router.post("/{organization_id}/members", response_model=OrgMemberResponse, status_code=201)
def add_member(
    organization_id: str,
    payload: OrgMemberAddRequest,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    ctx = get_admin_context(user, db)
    # Super organizers can only add 'organizer', not 'super_organizer'
    if not ctx.is_platform_admin:
        require_org_super_organizer(organization_id, ctx)
        if payload.role == "super_organizer":
            raise HTTPException(status_code=403, detail="Super organizers may only add 'organizer' role members")

    email = payload.email  # already normalized by the validator
    role = payload.role

    # Look up the Supabase auth user by email
    try:
        users_page = db.auth.admin.list_users()
        matched_user = next(
            (u for u in (users_page or []) if (u.email or "").lower() == email),
            None,
        )
    except Exception:
        matched_user = None

    if matched_user:
        # User already exists → create or update the membership row directly
        target_user_id = str(matched_user.id)
        existing = (
            db.table("organization_members")
            .select("user_id, role")
            .eq("organization_id", organization_id)
            .eq("user_id", target_user_id)
            .limit(1)
            .execute()
            .data
        )
        if existing:
            # Update role if different
            if existing[0]["role"] != role:
                db.table("organization_members").update({"role": role}).eq(
                    "organization_id", organization_id
                ).eq("user_id", target_user_id).execute()
        else:
            db.table("organization_members").insert({
                "organization_id": organization_id,
                "user_id": target_user_id,
                "role": role,
                "created_by_user_id": user.id,
            }).execute()

        record_audit(db, "organization.member.added", user.id, {
            "organization_id": organization_id,
            "target_user_id": target_user_id,
            "role": role,
        })

        name = (matched_user.user_metadata or {}).get("full_name")
        return OrgMemberResponse(
            user_id=target_user_id,
            email=matched_user.email,
            name=name,
            role=role,
            created_at=db.table("organization_members")
            .select("created_at")
            .eq("organization_id", organization_id)
            .eq("user_id", target_user_id)
            .limit(1)
            .execute()
            .data[0]["created_at"],
        )
    else:
        # No account yet → create a pending invitation by email
        # Check for existing pending invitation
        existing_inv = (
            db.table("organization_invitations")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("email", email)
            .is_("accepted_at", "null")
            .is_("revoked_at", "null")
            .limit(1)
            .execute()
            .data
        )
        if existing_inv:
            raise HTTPException(status_code=409, detail="A pending invitation already exists for this email")

        db.table("organization_invitations").insert({
            "organization_id": organization_id,
            "email": email,
            "role": role,
            "invited_by_user_id": user.id,
        }).execute()

        record_audit(db, "organization.invitation.created", user.id, {
            "organization_id": organization_id,
            "email": email,
            "role": role,
        })

        from datetime import datetime, timezone
        return OrgMemberResponse(
            user_id="00000000-0000-0000-0000-000000000000",
            email=email,
            name=None,
            role=role,
            created_at=datetime.now(timezone.utc).isoformat(),
        )


@router.delete("/{organization_id}/members/{target_user_id}", status_code=204)
def remove_member(
    organization_id: str,
    target_user_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    ctx = get_admin_context(user, db)
    require_org_super_organizer(organization_id, ctx)

    # Guard: never leave an org with zero super_organizers
    all_members = (
        db.table("organization_members")
        .select("user_id, role")
        .eq("organization_id", organization_id)
        .execute()
        .data
        or []
    )
    super_organizers = [m for m in all_members if m["role"] == "super_organizer"]
    if (
        len(super_organizers) <= 1
        and any(m["user_id"] == target_user_id for m in super_organizers)
    ):
        raise HTTPException(
            status_code=409,
            detail="Cannot remove the last super_organizer — add another before removing this one",
        )

    db.table("organization_members").delete().eq(
        "organization_id", organization_id
    ).eq("user_id", target_user_id).execute()

    record_audit(db, "organization.member.removed", user.id, {
        "organization_id": organization_id,
        "target_user_id": target_user_id,
    })


# ── Invitations ───────────────────────────────────────────────────────────────


@router.get("/{organization_id}/invitations", response_model=list[OrgInvitationResponse])
def list_invitations(
    organization_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    ctx = get_admin_context(user, db)
    require_org_super_organizer(organization_id, ctx)

    rows = (
        db.table("organization_invitations")
        .select("*")
        .eq("organization_id", organization_id)
        .is_("revoked_at", "null")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [OrgInvitationResponse(**r) for r in rows]


@router.delete("/{organization_id}/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    organization_id: str,
    invitation_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    ctx = get_admin_context(user, db)
    require_org_super_organizer(organization_id, ctx)

    from datetime import datetime, timezone
    db.table("organization_invitations").update({
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", invitation_id).eq("organization_id", organization_id).execute()

    record_audit(db, "organization.invitation.revoked", user.id, {
        "organization_id": organization_id,
        "invitation_id": invitation_id,
    })
