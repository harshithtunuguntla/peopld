-- Migration 028: Organization RBAC
-- Adds platform_admins, organizations, organization_members, organization_invitations
-- and extends events with organization_id.
-- All new tables use service-role-only RLS (no direct client policies).

-- ── Organizations ─────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT        NOT NULL,
  created_by_user_id UUID      REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ── Organization members ───────────────────────────────────────────────────────

CREATE TABLE organization_members (
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('super_organizer', 'organizer')),
  created_by_user_id UUID      REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- ── Organization invitations (pending email-based grants) ──────────────────────

CREATE TABLE organization_invitations (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'organizer'
                               CHECK (role IN ('super_organizer', 'organizer')),
  invited_by_user_id UUID      REFERENCES auth.users(id),
  accepted_user_id UUID        REFERENCES auth.users(id),
  accepted_at      TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organization_invitations_email
  ON organization_invitations(LOWER(email));

-- One active invitation per org+email (prevents duplicate invites).
CREATE UNIQUE INDEX idx_organization_invitations_pending_unique
  ON organization_invitations(organization_id, LOWER(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- ── Platform admins ───────────────────────────────────────────────────────────

CREATE TABLE platform_admins (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id UUID      REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- ── Extend events with organization context ───────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_events_organization_id
  ON events(organization_id);

-- ── Backfill: one organization per distinct existing organizer_id ─────────────
--
-- For every distinct organizer in the events table:
--   1. Create an organization named after their user id (safe default — the
--      real name can be updated via the admin UI later).
--   2. Add them as super_organizer of that organization.
--   3. Attach their events to that organization.
--
-- This runs in a DO block so it's idempotent and self-contained.

DO $$
DECLARE
  r RECORD;
  org_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT organizer_id FROM events WHERE organizer_id IS NOT NULL
  LOOP
    -- Create organization (one per organizer)
    INSERT INTO organizations (name, created_by_user_id)
    VALUES ('Organization ' || LEFT(r.organizer_id::TEXT, 8), r.organizer_id)
    RETURNING id INTO org_id;

    -- Add the organizer as super_organizer
    INSERT INTO organization_members (organization_id, user_id, role, created_by_user_id)
    VALUES (org_id, r.organizer_id, 'super_organizer', r.organizer_id)
    ON CONFLICT DO NOTHING;

    -- Attach all of their events to this organization
    UPDATE events
    SET organization_id = org_id
    WHERE organizer_id = r.organizer_id
      AND organization_id IS NULL;
  END LOOP;
END $$;
