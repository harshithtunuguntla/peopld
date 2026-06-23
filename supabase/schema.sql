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
  round_topics                  TEXT[] NOT NULL DEFAULT '{}',  -- organizer-authored agenda; index i = round i+1's theme (migration 012). Empty = canonical default names
  logo_url                      TEXT,            -- event/host brand logo, shown to attendees when show_event_logo (migration 014)
  show_event_logo               BOOLEAN NOT NULL DEFAULT TRUE,  -- organizer toggle: co-brand (logo + sponsors) vs sponsors-only (migration 014)
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
  company          TEXT,  -- where they work / what they're building (migration 009)
  description      TEXT,  -- short "what are you doing right now" line (migration 009)
  looking_for      TEXT,
  linkedin_url     TEXT,
  website_url      TEXT,  -- personal site / product link (migration 009)
  avatar_url       TEXT,  -- OAuth (Google) profile photo, captured at registration; null = use initials
  interests        TEXT[] NOT NULL DEFAULT '{}',  -- conversation-seed tags; shared ones highlighted on cards
  -- Pre-event directory controls (migration 009):
  show_in_directory BOOLEAN NOT NULL DEFAULT TRUE,  -- per-attendee opt-out of the public "who's coming" list
  tag              TEXT NOT NULL DEFAULT 'attendee'
                     CHECK (tag IN ('attendee', 'speaker', 'host')),  -- organizer-assigned; filters the directory
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
  -- Pause support (migration 008): paused_at is set while paused (null when
  -- running); total_paused_seconds accumulates past pauses. Effective end =
  -- started_at + duration_seconds + total_paused_seconds.
  paused_at            TIMESTAMPTZ,
  total_paused_seconds INTEGER NOT NULL DEFAULT 0,
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

-- Per-event registration code (Step 7): a short secret the organizer announces
-- in the room; attendees enter it before the registration form unlocks. SECRET —
-- its own table with NO RLS policies (service-role only), because the events
-- table is anon-readable for the public landing page. No row = open event.
CREATE TABLE event_access_codes (
  event_id   UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-event ROOM code (Phase 2 — self-service day-of check-in): a SECOND short
-- secret, separate from the access code above. Pre-registered attendees type it
-- in the room to flip themselves 'registered' -> 'arrived'. Must NOT be
-- shareable in advance (unlike the join code), so it is its own secret revealed
-- only at the venue. Same posture: own table, NO RLS policies (service-role
-- only). No row = check-in not open yet. (migration 010)
CREATE TABLE event_room_codes (
  event_id   UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Connection likes (Step 7): an attendee "likes" a tablemate during a live round;
-- surfaced in the post-event rolodex (mutual = a match). Private signals — its own
-- table with NO RLS policies (service-role only), like the other secret tables.
CREATE TABLE connection_likes (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  liker_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  liked_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, liker_attendee_id, liked_attendee_id)
);

-- Meeting intents (Phase 3a): a pre-event "I want to meet X" pick made while
-- browsing the directory. DISTINCT from connection_likes (that's the post-meeting
-- rolodex signal) — a different concept with different privacy, so its own table.
-- Phase 3b will teach seating to honor these. Private signals — NO RLS policies
-- (service-role only). Directed edge; a pair is mutual when both directions exist.
CREATE TABLE meeting_intents (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  liker_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  liked_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, liker_attendee_id, liked_attendee_id)
);

-- Connection notes (Step 7): a private one-liner an attendee jots about someone
-- they met. Author-only — its own table with NO RLS policies (service-role only).
CREATE TABLE connection_notes (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  target_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  note                TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, author_attendee_id, target_attendee_id)
);

-- Saved contacts (migration 013): an explicit "save" bookmark, SEPARATE from the
-- auto-rolodex and the like signal — a deliberate shortlist the saver filters to
-- later. Owner-only — its own table with NO RLS policies (service-role only).
CREATE TABLE connection_bookmarks (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner_attendee_id   UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  target_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, owner_attendee_id, target_attendee_id)
);

-- Current-round extension poll (migration 022): organizer asks checked-in
-- attendees whether to extend by 2, 3, or 5 minutes. Backend aggregates votes
-- and applies the 80% threshold exactly once; clients never read raw votes.
CREATE TABLE round_extension_polls (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_id          UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'extended', 'rejected')),
  eligible_count    INTEGER NOT NULL CHECK (eligible_count > 0),
  threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (threshold_percent > 0 AND threshold_percent <= 100),
  selected_seconds  INTEGER CHECK (selected_seconds IN (120, 180, 300)),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE round_extension_votes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id     UUID NOT NULL REFERENCES round_extension_polls(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  seconds     INTEGER NOT NULL CHECK (seconds IN (0, 120, 180, 300)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, attendee_id)
);

-- Sponsors (migration 014): shown to attendees between rounds + in the lobby,
-- rotating around the hourglass. Served by the backend (GET /events/:id/sponsors),
-- not client reads — so RLS is on with NO policies (service-role only).
CREATE TABLE sponsors (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  image_url     TEXT,
  tagline       TEXT,
  url           TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sponsors_event_idx ON sponsors(event_id);

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
ALTER TABLE event_access_codes ENABLE ROW LEVEL SECURITY; -- no policies: service-role only
ALTER TABLE event_room_codes   ENABLE ROW LEVEL SECURITY; -- no policies: service-role only
ALTER TABLE connection_likes ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE meeting_intents  ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE connection_notes ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE connection_bookmarks ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE round_extension_polls ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE round_extension_votes ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE sponsors         ENABLE ROW LEVEL SECURITY;  -- no policies: served by the backend (service-role)
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only

-- SECURITY MODEL: all writes and all PII reads go through the FastAPI
-- backend (service-role key, bypasses RLS, enforces ownership checks).
-- Client-side keys get SELECT only on non-PII tables needed for the
-- public landing page and Realtime subscriptions. The attendees table
-- (names, LinkedIn, contact details) is NOT client-readable.

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

-- REPLICA IDENTITY FULL: required so DELETE events (round cancel/rollback) carry
-- the full old row incl. event_id, so phones subscribed with an event_id filter
-- still receive them. Without this, a cancelled round would be missed by filtered
-- subscribers until the polling fallback. See docs/design/realtime.md (REQ-RT-02).
ALTER TABLE rounds            REPLICA IDENTITY FULL;
ALTER TABLE table_assignments REPLICA IDENTITY FULL;
ALTER TABLE icebreakers       REPLICA IDENTITY FULL;

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
CREATE UNIQUE INDEX idx_round_extension_polls_one_active ON round_extension_polls(round_id) WHERE status = 'active';
CREATE UNIQUE INDEX idx_round_extension_polls_one_success ON round_extension_polls(round_id) WHERE status = 'extended';
CREATE INDEX idx_round_extension_polls_round ON round_extension_polls(round_id, created_at DESC);
CREATE INDEX idx_round_extension_votes_poll ON round_extension_votes(poll_id);
