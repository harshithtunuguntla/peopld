-- Migration 007 — shared-interest tags + private connection notes
--
-- WHY:
--  * interests: a short list of conversation-seed tags an attendee picks at
--    registration ("AI", "Climate", "Hiring"). Surfaced on tablemate cards and
--    the rolodex, with SHARED tags highlighted so people have an instant opener.
--    Lives on attendees (already service-role-only) — no new client exposure.
--  * connection_notes: a private, one-line memory an attendee jots about someone
--    they met ("intro to Priya re: hiring"). Author-only — like likes, the table
--    has RLS on with NO policies, so only the backend service-role key touches it.
--
-- Idempotent: safe to re-run.

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS connection_notes (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  target_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  note                TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, author_attendee_id, target_attendee_id)
);

-- No policies: only the backend service-role key can read/write notes.
ALTER TABLE connection_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_connection_notes_author
  ON connection_notes(event_id, author_attendee_id);
