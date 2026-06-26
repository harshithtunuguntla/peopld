-- Migration 024 — Post-event feedback / testimonials
-- A subtle, never-forced "how was it?" ask on the recap screen: a 1-5 rating
-- plus an optional free-text testimonial. One row per attendee per event
-- (resubmitting updates it, never duplicates). Service-role only — RLS enabled
-- with NO policies; there is deliberately no organizer-facing read endpoint yet,
-- the team reviews responses directly in Supabase.
CREATE TABLE IF NOT EXISTS event_feedback (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id   UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, attendee_id)
);

ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
