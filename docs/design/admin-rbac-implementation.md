# Admin & Organization RBAC — Implementation Record

**Status:** Implemented  
**Spec:** [admin-rbac.md](admin-rbac.md)  
**Migration:** `supabase/migrations/028_rbac.sql`

---

## What Was Built

### Roles

| Role | Scope | Can Do |
|---|---|---|
| `super_admin` (platform admin) | Platform-wide | Create orgs, grant/revoke platform admins, see all events and orgs, add any role to any org |
| `super_organizer` | One organization | Add/remove organizers within their org, see all events in their org |
| `organizer` | One organization | Create and manage events within their org |

Role membership is stored in the database and checked on every request — not read from the JWT `app_metadata`. Revocations take effect immediately.

---

## Database Schema (`028_rbac.sql`)

### New tables

**`organizations`**
```
id               UUID  PK
name             TEXT  NOT NULL
created_by_user_id UUID REFERENCES auth.users
created_at       TIMESTAMPTZ
```

**`organization_members`**
```
organization_id  UUID  FK → organizations(id)  ON DELETE CASCADE
user_id          UUID  FK → auth.users(id)      ON DELETE CASCADE
role             TEXT  CHECK IN ('super_organizer', 'organizer')
created_by_user_id UUID
created_at       TIMESTAMPTZ
PRIMARY KEY (organization_id, user_id)
```

**`organization_invitations`**
```
id               UUID  PK
organization_id  UUID  FK → organizations(id)  ON DELETE CASCADE
email            TEXT  NOT NULL  (stored lowercase)
role             TEXT  DEFAULT 'organizer'
invited_by_user_id UUID
accepted_user_id UUID
accepted_at      TIMESTAMPTZ  (NULL = still pending)
revoked_at       TIMESTAMPTZ  (NULL = not revoked)
created_at       TIMESTAMPTZ
UNIQUE INDEX on (organization_id, LOWER(email)) WHERE pending
```

**`platform_admins`**
```
user_id          UUID  PK FK → auth.users(id)
created_by_user_id UUID
created_at       TIMESTAMPTZ
```

### Modified tables

**`events`** — added:
```
organization_id  UUID  REFERENCES organizations(id)
```

All four tables have RLS enabled (service-role only; no direct client access).

### Backfill

The migration runs a `DO $$` block that:
1. Creates one organization per distinct `events.organizer_id`.
2. Adds the organizer as `super_organizer` of that org.
3. Sets `events.organization_id` for all their existing events.

Existing data is fully migrated; no manual steps needed after running the migration.

---

## Backend

### `backend/app/deps.py`

Added:

- **`AdminContext`** dataclass — resolved from DB on every protected request:
  ```python
  @dataclass
  class AdminContext:
      user_id: str
      email: str | None
      platform_role: str | None      # 'super_admin' or None
      memberships: list[OrganizationMembershipInfo]
  ```

- **`get_admin_context(user, db) → AdminContext`** — reads `platform_admins` and `organization_members` with org names.

- **`get_current_admin_ctx`** — FastAPI dependency; rejects unauthenticated requests.

- **`_materialize_pending_invitations(user, db)`** — called on `GET /me/context`; finds any pending invitations matching the signed-in user's email and converts them to `organization_members` rows.

- **Guards:**
  - `require_platform_admin(ctx)` — 403 if not super admin
  - `require_any_admin(ctx)` — 403 if no platform role and no org memberships
  - `require_org_super_organizer(org_id, ctx)` — 403 if not super organizer of that org (platform admin bypasses)
  - `require_event_admin(event, ctx)` — allows if: platform admin; or org member whose org owns the event; or legacy fallback (event creator, pre-backfill)

### `backend/app/routers/me.py`

Added **`GET /me/context`**:
- Materializes pending invitations first.
- Returns `UserContextResponse`:
  ```json
  {
    "user_id": "...",
    "email": "...",
    "platform_role": "super_admin | null",
    "memberships": [
      { "organization_id": "...", "organization_name": "...", "role": "super_organizer | organizer" }
    ],
    "default_admin_url": "/admin | /organizer/dashboard | /home"
  }
  ```

### `backend/app/routers/organizations.py`

| Method | Path | Who can call |
|---|---|---|
| GET | `/organizations/{org_id}/members` | super_organizer of that org, platform admin |
| POST | `/organizations/{org_id}/members` | super_organizer (role=organizer only), platform admin (any role) |
| DELETE | `/organizations/{org_id}/members/{user_id}` | super_organizer, platform admin |
| GET | `/organizations/{org_id}/invitations` | super_organizer, platform admin |
| DELETE | `/organizations/{org_id}/invitations/{invitation_id}` | super_organizer, platform admin |

Adding a member by email: if the user exists → direct `organization_members` insert; if not → `organization_invitations` insert (accepted automatically on their next sign-in via `GET /me/context`).

Guards against removing the last super_organizer from an org.

### `backend/app/routers/admin.py`

All routes require `platform_admin`.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/summary` | Platform aggregate stats |
| GET | `/admin/events` | All events |
| GET | `/admin/organizations` | All orgs with member counts |
| POST | `/admin/organizations` | Create a new org (caller becomes super_organizer) |
| GET | `/admin/platform-admins` | List all platform admins |
| POST | `/admin/platform-admins` | Grant platform admin by email |
| DELETE | `/admin/platform-admins/{user_id}` | Revoke (cannot remove yourself) |
| GET | `/admin/activity` | Recent audit log |

### Updated routers

`events.py`, `rounds.py`, `attendees.py`, `announcements.py`, `sponsors.py`, `feedback_forms.py` — all replaced the old `get_current_organizer_id` + `require_event_owner` pattern with `AdminContext` + `require_event_admin`. Event visibility on `/events/mine` is now org-scoped.

---

## Frontend

### New hook: `frontend/src/lib/admin/use-admin-context.ts`

```typescript
export function useAdminContext(): {
  user: User | null
  context: AdminContext | null   // from GET /me/context
  checked: boolean               // false until context resolved
  isPlatformAdmin: boolean
  memberships: OrgMembership[]
  activeOrganization: OrgMembership | null   // first membership
  roleLabel: string              // "Platform Admin" | "Super Organizer" | "Organizer" | ""
  canManageTeam: boolean         // super_organizer or platform admin
}
```

Uses module-level cache to avoid re-fetching on every page navigation within the console. Cache is invalidated on sign-out.

### Updated hook: `frontend/src/lib/organizer/use-organizer.ts`

Rebuilt on top of `useAdminContext`. `isOrganizer = isPlatformAdmin || memberships.length > 0`. Backward-compatible return shape.

### New pages

| Route | Who can access | What it does |
|---|---|---|
| `/admin` | Platform admin only | Stats overview, navigation links, **grant/revoke platform admins by email** |
| `/admin/events` | Platform admin only | Read-only list of all events |
| `/admin/organizations` | Platform admin only | **Create organization**, list orgs (click through to detail) |
| `/admin/organizations/[orgId]` | Platform admin only | **Add super_organizer or organizer** by email, remove members, revoke invitations |
| `/organizer/team` | Super organizer or platform admin | Add organizer (role fixed to organizer for super_organizers), remove members, revoke invitations |

### Updated: `frontend/src/app/organizer/login/page.tsx`

Post-login redirect is now role-aware via `GET /me/context`:
- `super_admin` → `/admin`
- org member → `/organizer/dashboard`
- neither → `/home`

### Updated: `frontend/src/components/organizer/console-shell.tsx`

Added "Team" entry in sidebar nav pointing to `/organizer/team`.

---

## Bootstrap (one-time SQL)

The very first platform admin must be seeded directly because there is no admin to grant the first one through the UI:

```sql
-- 1. Find your user id
SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- 2. Insert
INSERT INTO platform_admins (user_id) VALUES ('<your-user-id>');
```

After that, all further platform admin grants are done through `/admin`.

---

## How Each Role Is Assigned

### Grant platform admin (super admin)
1. Sign in as an existing platform admin.
2. Go to `/admin`.
3. Enter email in the "Platform admins" section → click Grant.
4. The user must already have a Peopld account.

### Create an organization
1. Sign in as a platform admin.
2. Go to `/admin/organizations`.
3. Enter the org name → click Create.
4. You (the platform admin) are added as super organizer automatically.

### Assign a super organizer
1. Sign in as a platform admin.
2. Go to `/admin/organizations` → click the organization.
3. Enter the user's email, select "Super Organizer" from the role dropdown → click add.
4. If the user has no account yet, they get a pending invitation activated on first sign-in.

### Super organizer adds an organizer
1. Sign in as a super organizer.
2. Go to `/organizer/team` (via sidebar).
3. Enter email → click add. Role is always `organizer` (super organizers cannot grant super_organizer).
4. Pending invitation applies the same way.
