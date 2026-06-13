-- Peopld — Pre-MVP Schema
-- Run this in your Supabase SQL editor to set up the database.

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE events (
  id                            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name                          TEXT NOT NULL,
  date                          DATE NOT NULL,
  time                          TIME NOT NULL,
  location                      TEXT NOT NULL,
  description                   TEXT,
  num_tables                    INTEGER NOT NULL,
  seats_per_table               INTEGER NOT NULL,
  default_round_duration_seconds INTEGER NOT NULL DEFAULT 300,
  auto_arrive_on_register       BOOLEAN NOT NULL DEFAULT TRUE,
  target_rounds                 INTEGER,        -- intended round count (planning horizon); NULL = engine picks
  organizer_id                  UUID NOT NULL REFERENCES auth.users(id),
  status                        TEXT NOT NULL DEFAULT 'upcoming'
                                  CHECK (status IN ('upcoming', 'active', 'ended')),
  created_at                    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE attendees (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id),
  name             TEXT NOT NULL,
  role             TEXT NOT NULL,
  looking_for      TEXT,
  linkedin_url     TEXT,
  whatsapp_number  TEXT,
  status           TEXT NOT NULL DEFAULT 'registered'
                     CHECK (status IN ('registered', 'arrived', 'left')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rounds (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_number     INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed')),
  UNIQUE (event_id, round_number)
);

CREATE TABLE table_assignments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id     UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  UNIQUE (round_id, attendee_id)
);

CREATE TABLE icebreakers (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id              UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  table_number          INTEGER NOT NULL,
  recipient_attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  target_attendee_id    UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  question_text         TEXT NOT NULL,
  generated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seating previews (Step 4): NOT client-readable, NOT in the realtime
-- publication — attendee phones learn nothing until the organizer publishes.
-- UNIQUE(event_id) = one pending draft per event (double-click safe).
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

-- Plan cache (Step 4 v2 — re-planning): the cached multi-round plan, followed
-- while planned_for_hash matches the live arrived set + config. NOT client-
-- readable, NOT in the realtime publication. See docs/design/rotation-replanning.md.
CREATE TABLE round_plans (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  planned_for_hash    TEXT NOT NULL,
  horizon_start_round INTEGER NOT NULL,
  plan                JSONB NOT NULL,           -- [ {attendee_id: table_number}, ... ] remaining rounds
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail (Step 4): every state-changing action. metadata holds
-- UUIDs/enums/counts only, never PII.
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

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE icebreakers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_drafts     ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE round_plans      ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only

-- SECURITY MODEL: all writes and all PII reads go through the FastAPI
-- backend (service-role key, bypasses RLS, enforces ownership checks).
-- Client-side keys get SELECT only on non-PII tables needed for the
-- public landing page and Realtime subscriptions. The attendees table
-- (names, WhatsApp, LinkedIn) is NOT client-readable.

-- Anyone can read event details (public landing page)
CREATE POLICY "events_public_read" ON events
  FOR SELECT USING (true);

-- Rounds are readable by all (needed for realtime)
CREATE POLICY "rounds_public_read" ON rounds
  FOR SELECT USING (true);

-- Table assignments are readable by all (needed for realtime)
CREATE POLICY "table_assignments_public_read" ON table_assignments
  FOR SELECT USING (true);

-- Icebreakers are readable by all
CREATE POLICY "icebreakers_public_read" ON icebreakers
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────
-- REALTIME
-- Enable on tables that attendee phones subscribe to
-- ─────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE table_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE icebreakers;

-- ─────────────────────────────────────────────
-- INDEXES (performance for common queries)
-- ─────────────────────────────────────────────

CREATE INDEX idx_attendees_event_id ON attendees(event_id);
CREATE INDEX idx_rounds_event_id ON rounds(event_id);
CREATE INDEX idx_rounds_status ON rounds(status);
CREATE INDEX idx_table_assignments_round_id ON table_assignments(round_id);
CREATE INDEX idx_table_assignments_attendee_id ON table_assignments(attendee_id);
CREATE INDEX idx_icebreakers_round_recipient ON icebreakers(round_id, recipient_attendee_id);
CREATE INDEX idx_table_assignments_round_table ON table_assignments(round_id, table_number);
CREATE INDEX idx_audit_log_event_created ON audit_log(event_id, created_at);
