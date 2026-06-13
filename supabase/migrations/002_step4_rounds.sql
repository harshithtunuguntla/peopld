-- Migration 002 — Step 4 (rotation rounds). Run AFTER 001 in the SQL editor.
-- Adds: on-site auto-arrive flag, seating drafts (preview), audit trail.
-- Spec: docs/design/rotation-algorithm.md

-- Registration happens at the venue for the pilot: registering marks you
-- arrived immediately. Organizer can toggle per event (PATCH /events/:id).
ALTER TABLE events
  ADD COLUMN auto_arrive_on_register BOOLEAN NOT NULL DEFAULT TRUE;

-- Seating previews. Deliberately NOT client-readable (no RLS policies) and
-- NOT in the realtime publication: attendee phones must learn nothing until
-- the organizer publishes. UNIQUE(event_id) = one pending draft per event,
-- which also makes double-clicked Start safe at the DB level.
CREATE TABLE round_drafts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id         UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  round_number     INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  assignments      JSONB NOT NULL,           -- [{attendee_id, table_number}]
  arrived_hash     TEXT NOT NULL,            -- snapshot of arrived set + table config (stale-draft guard)
  repeat_pairings  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE round_drafts ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: service-role (backend) access only

-- Audit trail: every state-changing action — who did what, to what, when.
-- metadata holds UUIDs/enums/counts only, never PII.
CREATE TABLE audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      UUID REFERENCES events(id) ON DELETE CASCADE,
  actor_user_id UUID,                        -- no FK: keep history even if the user is deleted
  action        TEXT NOT NULL,               -- e.g. round.published, attendee.status_changed
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: service-role (backend) access only

CREATE INDEX idx_audit_log_event_created ON audit_log(event_id, created_at);
