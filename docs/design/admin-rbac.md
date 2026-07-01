# Admin and Organization RBAC Plan

Status: proposal, not implemented.

This document captures the current understanding for adding platform super admins,
organization super organizers, and normal organizers to Peopld. It is intentionally
written before implementation because this change affects auth, permissions, data
visibility, and live-event controls.

## Decisions Confirmed

- Existing functionality must not be removed.
- Keep `/organizer/login` working.
- Keep the current attendee and organizer flows working unless explicitly changed.
- Role grants are tied to a Supabase auth user identified by email/user id.
- Admin/organizer membership is email-id based. Use normalized email addresses
  and Supabase auth user ids; do not use phone numbers for admin identity.
- Do not introduce phone-based login for admin or organizer access.
- Do not remove existing attendee Google/email-OTP sign-in or existing organizer
  email/password sign-in. The new role resolution should work after either
  existing sign-in path.
- Normal organizers should see all events in their organization. This is the
  intended meaning of the "yes" confirmation on organizer visibility.
- Super admins are allowed to edit, start, end, and otherwise operate any event.
- Super organizers can add normal organizers to their respective organization.
- Super organizers cannot add organizers to another organization.
- Admin pages must be hidden from non-admin users.
- After sign-in, users with admin/organizer access should see their role and be
  directed to the right admin/organizer area.

## Current System

The current product uses a single-owner organizer model:

- `events.organizer_id` references `auth.users(id)`.
- Organizer access is determined by `auth.users.app_metadata.role = "organizer"`.
- Organizer endpoints check only whether the caller is an organizer, then check
  whether `events.organizer_id` matches the caller.
- `/events/mine` returns only events where `organizer_id` is the logged-in user.
- Frontend organizer pages use `useOrganizer()` and only allow
  `app_metadata.role === "organizer"`.

There is no runtime organization membership model yet. The architecture docs
already describe an Organizations domain, but the database has not implemented it.

Implementation note:

- Treat `app_metadata.role` as a legacy/bootstrap hint after this change.
- DB-backed platform admins and organization memberships must become the source
  of truth for admin access.
- Do not require `app_metadata.role = "organizer"` for a user who has an active
  `organization_members` row; otherwise newly added organizers can sign in but
  still fail the current gates until their JWT metadata is manually changed.

## Target Roles

### Super Admin

Platform-level role.

Can:

- View all organizations.
- View all current/live/upcoming/ended events across the platform.
- Open any organization dashboard.
- Open any event admin page.
- Edit, start, end, archive, unarchive, publish rounds, cancel rounds, manage
  attendees, view analytics, manage feedback, sponsors, access codes, and room
  codes for any event.
- See platform-level activity.

Important:

- This is the broadest role and can access PII and live-event controls.
- Every super-admin action should be audited with `actor_user_id`.

### Super Organizer

Organization-level owner/admin role.

Can:

- View all events in their organization.
- View organization-level activity.
- Create events in the organization.
- Manage all events in the organization.
- Add normal organizers to their own organization.
- Cannot add organizers to another organization.
- Cannot create platform super admins.
- Remove or deactivate normal organizer membership in their own organization.
- Promote/demote organizers only if explicitly allowed later.

### Organizer

Organization-level operational role.

Can:

- View all events in their organization.
- Create events in their organization.
- Manage organization events, including live control actions.

Confirmed assumption:

- Organizers see all organization events, not only events they personally created.

## Proposed Database Changes

Add organization tables:

```sql
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_organizer', 'organizer')),
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_organization_members_user_id
  ON organization_members(user_id);

CREATE TABLE organization_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'organizer'
    CHECK (role IN ('super_organizer', 'organizer')),
  invited_by_user_id UUID REFERENCES auth.users(id),
  accepted_user_id UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organization_invitations_email
  ON organization_invitations(LOWER(email));

CREATE UNIQUE INDEX idx_organization_invitations_pending_unique
  ON organization_invitations(organization_id, LOWER(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
```

Add organization ownership to events:

```sql
ALTER TABLE events
  ADD COLUMN organization_id UUID REFERENCES organizations(id);

CREATE INDEX idx_events_organization_id
  ON events(organization_id);
```

Recommended backfill:

- Safest default: create one organization per distinct existing
  `events.organizer_id`.
- Add each existing event owner as `super_organizer` of their generated
  organization.
- Set each existing event's `organization_id` to the organization generated for
  its current `organizer_id`.
- If the production database is confirmed to have one real organization only,
  the implementer may instead create one manually named default organization and
  attach all existing events to it. Do not silently merge multiple real customer
  organizations into one organization.
- Keep `events.organizer_id` as the event creator/primary organizer for backward
  compatibility and audit context.
- Manually review any existing auth users with `app_metadata.role = "organizer"`
  but no events; add them to the right organization if they should retain access.

After backfill is verified, `events.organization_id` can become `NOT NULL`.

RLS posture:

- Keep these new tables service-role only with no direct client policies unless
  there is a strong reason to expose them directly.
- Continue enforcing permissions in FastAPI, consistent with the current app.

## Backend Permission Model

Replace the single `get_current_organizer_id()` plus `require_event_owner()` model
with role-aware helpers.

Important:

- Existing `AuthUser.role` can remain for backwards compatibility, but it must
  not be the authorization source for organization access.
- Authorization should be resolved from the database on each protected request so
  membership removals and role changes take effect without waiting for JWT
  refresh.
- All audit records should keep using the actual signed-in `user.id` as
  `actor_user_id`.

Suggested helpers:

```python
def get_current_user(...)
def get_admin_context(user, db) -> AdminContext
def require_platform_admin(context) -> None
def require_any_admin(context) -> None
def require_event_admin(event, context) -> None
def require_org_super_organizer(organization_id, context) -> None
```

Suggested `AdminContext`:

```python
class AdminContext:
    user_id: str
    email: str | None
    is_platform_admin: bool
    memberships: list[OrganizationMembership]
```

Event access rule:

- Platform super admin: allowed for every event.
- Organization super organizer: allowed when event belongs to their organization.
- Organization organizer: allowed when event belongs to their organization.
- Everyone else: forbidden.

Event creation rule:

- Organization super organizer or organizer: create the event inside the active
  organization and set `events.organization_id` to that organization.
- Preserve `events.organizer_id = actor_user_id` as creator/primary organizer.
- Platform super admin: must choose an organization when creating an event, or
  use an explicit admin-only organization creation flow first.

Team-management rule:

- Platform super admin: can manage organization members for any organization.
- Organization super organizer: can add normal organizers to their own organization only.
- Normal organizer: cannot add organizers.
- A super organizer's add-member endpoint must reject `role = "super_organizer"`
  unless a later product decision explicitly allows promotions.
- Member removal must not leave an organization with zero `super_organizer`
  members.

Email invitation rule:

- If the email already belongs to a Supabase auth user, create or update the
  `organization_members` row immediately.
- If the email does not belong to a Supabase auth user yet, create a pending
  `organization_invitations` row using a normalized lowercase email.
- On `/me/context`, match pending invitations by normalized `user.email`, create
  the membership idempotently, and mark the invitation accepted.
- Do not grant access from an invitation alone; access starts only once it is
  materialized into `organization_members` for the signed-in user.
- First implementation should not send invitation emails. The super organizer can
  tell the person to sign in with that email. Email delivery can be added later.

## API Changes

### User Context

Add:

```http
GET /me/context
```

Returns:

```json
{
  "user_id": "uuid",
  "email": "person@example.com",
  "platform_role": "super_admin",
  "memberships": [
    {
      "organization_id": "uuid",
      "organization_name": "Peopld",
      "role": "super_organizer"
    }
  ],
  "default_admin_url": "/admin"
}
```

For an attendee with no admin role:

```json
{
  "user_id": "uuid",
  "email": "person@example.com",
  "platform_role": null,
  "memberships": [],
  "default_admin_url": null
}
```

### Organization Team

Add:

```http
GET /organizations/:organization_id/members
POST /organizations/:organization_id/members
DELETE /organizations/:organization_id/members/:user_id
GET /organizations/:organization_id/invitations
DELETE /organizations/:organization_id/invitations/:invitation_id
```

Adding a member is email-based. The API should normalize email before lookup or
insert.

Example body:

```json
{
  "email": "organizer@example.com",
  "role": "organizer"
}
```

For organization super organizers:

- The only allowed role in the request body is `"organizer"`.
- The organization id must be one where the caller is `super_organizer`.
- If the Supabase user does not exist yet, create a pending invitation by email.

For platform super admins:

- They may add `organizer` or `super_organizer` to any organization.

### Platform Admin

Add:

```http
GET /admin/summary
GET /admin/events
GET /admin/organizations
GET /admin/activity
```

These power the super-admin pages.

### Existing Organizer Endpoints

Update existing owner-only endpoints to use `require_event_admin(...)` instead
of strict `require_event_owner(...)`.

Affected areas include:

- Events list, create, update, archive, unarchive, end.
- `/events/mine` and `/events/dashboard-summary`: return organization-scoped
  events and totals for organization members. Platform super admins should use
  platform `/admin/*` endpoints for global views unless the frontend explicitly
  passes an organization context.
- Access code and room code management.
- Attendee list and attendee status changes.
- Walk-ins and check-in-all.
- Round draft, publish, begin, pause, resume, end, cancel.
- Sponsors.
- Feedback form builder/results.
- Announcements.
- Analytics and live stats.
- Self-or-organizer helper checks in attendee detail, connections, directory,
  and icebreaker routes. These currently compare `event.organizer_id` directly;
  they must be changed to "self or event admin".
- Frontend event-specific organizer pages that currently use `/events/mine` as
  an access check should fetch the event by id or use an event-admin endpoint, so
  super admins and org-level organizers can open events they did not personally
  create.

## Frontend Changes

### Auth and Routing

Do not remove `/organizer/login`.

Add a shared role resolution step after sign-in:

- `/auth` remains available.
- `/organizer/login` remains available.
- After any successful login, fetch `/me/context`.
- If user is platform super admin, show role state and link/redirect to `/admin`.
- If user is super organizer or organizer, show role state and link/redirect to
  `/organizer/dashboard`.
- If user has no admin role, send them to `/home`.

Email identity details:

- The role lookup uses the signed-in user's Supabase `user.id` and normalized
  `email`.
- A user without an email address should not receive admin/organizer access.
- Existing `/organizer/login` can continue to use email/password.
- Existing `/auth` can continue to use email OTP and Google. Google users still
  have an email identity, so membership matching remains email-id based.

Important:

- Admin and organizer pages should render a neutral loading gate until role
  context is known.
- Non-admin users must not see admin shell/sidebar content before redirect.

### Existing Organizer Pages

Update `useOrganizer()` into a broader admin/organization hook, or add a new hook
and migrate pages gradually.

Suggested:

```ts
useAdminContext()
```

It should return:

- `user`
- `checked`
- `isPlatformAdmin`
- `memberships`
- `activeOrganization`
- `roleLabel`
- `canManageTeam`

Organizer dashboard changes:

- Normal organizers see all organization events.
- Super organizers see all organization events plus team controls.
- Super admins can see platform pages and can also open any organization/event.
- If a user belongs to multiple organizations, show an organization selector or
  use an explicit active organization context. Do not silently mix events from
  multiple organizations in one organizer dashboard unless that is an intentional
  product decision.

### New Pages

Add:

```text
/admin
/admin/events
/admin/organizations
/admin/organizations/[organizationId]
/organizer/team
```

Optional first version:

- Put organization team management under `/organizer/settings` instead of adding
  `/organizer/team`, if we want fewer routes.

## Activity Visibility

Use existing tables for activity:

- `events`
- `attendees`
- `rounds`
- `table_assignments`
- `connection_likes`
- `meeting_intents`
- `feedback_forms`
- `feedback_submissions`
- `event_announcements`
- `audit_log`

Recommended first activity view:

- Current live events.
- Upcoming events.
- Recently ended events.
- Recent audit actions.
- Per-organization totals: events, attendees, checked-in count, rounds completed,
  likes, matches, introductions.

Avoid exposing raw private signals by default:

- Show counts for likes, meeting intents, notes, and bookmarks.
- Do not show private attendee notes content in admin dashboards.
- Do not expose one-sided meeting intent details unless explicitly needed.

## Audit Requirements

Add audit actions for:

- Organization created.
- Member added.
- Member removed.
- Member role changed.
- Invitation created.
- Invitation accepted.
- Invitation revoked.
- Super admin modified any event through platform-wide privileges.

Do not log secrets:

- Access code value.
- Room code value.
- Raw private notes.
- Raw auth tokens.

## Flow Sentinel Review

Risk level: NEEDS CONFIRMATION before implementation.

Affected flows:

- Auth and login routing.
- Organizer dashboard visibility.
- Event ownership checks.
- Live-event controls.
- Organization/team management.
- PII access boundaries.
- Database schema and migration/backfill.

Load and cost impact:

- Low expected runtime load.
- No new LLM/API cost.
- Some extra Supabase reads for role context and admin summaries.

Main risks:

- Incorrect role checks could expose attendee PII or live controls.
- Super-admin permissions intentionally widen access to every event.
- Backfill must not orphan existing events.
- A too-broad backfill could merge unrelated organizers into one organization and
  expose events across tenants.
- JWT `app_metadata.role` alone is not enough for organization roles because it
  does not model multiple organizations and can be stale until token refresh.

Recommended safer path:

- Add DB-backed memberships and platform admins.
- Keep existing auth entry points.
- Preserve `events.organizer_id` while adding `events.organization_id`.
- Move backend checks to server-side membership lookup.
- Ship platform/org dashboards after API permission tests are in place.

Confirmation needed:

- Yes, before coding, because this widens role and event-control access.
- If the product owner gives this document to an implementation agent with an
  explicit instruction to implement it, treat the confirmed decisions and
  first-version defaults in this document as that confirmation.

## Claude Implementation Checklist

Use this checklist when handing the plan to an implementation agent:

- Preserve existing functionality, including `/auth`, `/organizer/login`, attendee
  Google/email-OTP sign-in, and organizer email/password sign-in.
- Treat DB-backed `platform_admins` and `organization_members` as the source of
  truth. `auth.users.app_metadata.role` is legacy/bootstrap only.
- Normal organizers see all events in their organization.
- Super organizers can add normal organizers only inside their own organization.
- Super admins can edit/start/end/control any event across the platform.
- Backfill safely: prefer one generated organization per existing
  `events.organizer_id` unless a single real organization is explicitly confirmed.
- Support pending email invitations for organizer emails that do not yet have a
  Supabase auth user. Do not send invitation emails in the first version.
- Update all direct `event.organizer_id` checks to organization-aware admin checks,
  including directory, connections, icebreakers, attendee detail, and frontend
  event-admin detection paths.
- Update `/events/mine` and dashboard summary to be organization-scoped for
  organization members.
- Do not expose raw private signals in admin dashboards by default. Show counts
  for likes, meeting intents, notes, and bookmarks unless explicitly approved.
- Do not allow member removal to leave an organization with zero
  `super_organizer` members.
- Add backend tests before relying on the UI: attendee denied, organizer org-only,
  super organizer own-org team actions, super admin global control, pending
  invitation acceptance, revoked invitation denial, and member-removal revocation.

## Implementation Order

1. Add migration for `organizations`, `organization_members`,
   `organization_invitations`, `platform_admins`, and `events.organization_id`.
2. Backfill existing events into organizations, preferably one organization per
   distinct existing `events.organizer_id` unless a single real organization is
   explicitly confirmed.
3. Add backend role context helpers.
4. Add `/me/context`, including idempotent pending-invitation acceptance by
   normalized email.
5. Add API tests for all role combinations.
6. Update event/round/attendee/feedback/sponsor/announcement endpoints to use
   organization-aware event admin checks.
7. Update directory, connections, icebreaker, attendee-detail, and frontend
   event-admin detection paths that currently compare `event.organizer_id`
   directly.
8. Add organization member and invitation APIs.
9. Update `/events/mine` and dashboard summary to be organization-scoped.
10. Add frontend `useAdminContext()`.
11. Update organizer gate and dashboard to use organization events.
12. Add `/admin` platform pages.
13. Add `/organizer/team` or settings team management.
14. Verify with backend tests, frontend typecheck, and manual login checks.

## Verification Plan

Backend tests:

- Attendee cannot access admin pages/endpoints.
- Organizer can see all events in their organization.
- Organizer cannot see events from another organization.
- Super organizer can add organizer to own organization.
- Super organizer cannot add `super_organizer` unless the product owner later
  approves promotion.
- Super organizer cannot add members to another organization.
- Pending invitation by email becomes active after that email signs in.
- Revoked invitation does not become active after sign-in.
- Super admin can see and control any event.
- Super admin can add organizers or super organizers to any organization.
- Existing single-organizer event flows still work after backfill.
- Removing an organization member revokes access on the next request, even if the
  user's JWT still has legacy `app_metadata.role = "organizer"`.

Frontend checks:

- Signed-out user opening `/organizer/dashboard` goes to `/organizer/login`.
- Signed-in attendee opening `/organizer/dashboard` goes to `/home` without
  seeing admin shell.
- Organizer sees role and organization events.
- Super organizer sees team management.
- Super admin sees `/admin`.
- `/organizer/login` still works.
- Existing `/auth` still works.
- Event-specific organizer pages open for organization members and super admins,
  even when they are not the original `events.organizer_id`.
- Existing attendee `/auth`, `/home`, join, register, live, and recap flows still
  work.

Manual live-event smoke:

- Create event.
- Add/register attendees.
- Check in attendees.
- Draft and publish round.
- Start/end round.
- End event.
- Confirm attendee phone recovers from refresh/reconnect.

## First-Version Defaults

- Super organizers only add normal organizers. Promotion to `super_organizer` is
  platform-super-admin-only unless the product owner later approves org-level
  promotion.
- Pending organization invitations do not send email in the first version.
- Platform super admins are managed only in the platform admin area, not in each
  organization team page.
- Organization branding/settings are out of this change. Implement membership,
  org-scoped event visibility, role routing, and platform admin access first.
