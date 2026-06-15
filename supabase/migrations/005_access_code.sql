-- Migration 005 — Per-event access code (attendee registration gate)
--
-- Attendees enter a short code (announced by the organizer in the room) before
-- the registration form unlocks. Keeps walk-by strangers out and gives the
-- organizer a guided "the code is MIXER" moment.
--
-- WHY A SEPARATE TABLE (not an events column): the events table is anon-readable
-- for the public landing page (see migration 001), so any column on it is
-- readable with the public key. The code is a SECRET, so it lives in its own
-- table with NO RLS policies — service-role only, exactly like round_drafts /
-- round_plans. Attendee phones can never read it; the FastAPI backend reads it
-- to verify on POST /verify-code and POST /attendees, and the public
-- GET /events/:id exposes only a derived `requires_code` boolean.
--
-- One code per event (PK on event_id). No code row = open event (link is the gate).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS event_access_codes (
  event_id   UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service-role only: RLS on, zero policies (same posture as round_drafts).
ALTER TABLE event_access_codes ENABLE ROW LEVEL SECURITY;
