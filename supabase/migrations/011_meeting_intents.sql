-- Migration 011 — pre-event meeting intents ("I want to meet X")
--
-- Phase 3a of the pre-event experience. Browsing the "who's coming" directory,
-- an attendee can mark people they most want to meet. Phase 3b will teach the
-- seating algorithm to honor these (guarantee mutual picks, one-way as a soft
-- bonus); 3a just captures the intent, shows it, nudges at the table, and reveals
-- mutual matches after the event.
--
-- WHY ITS OWN TABLE (not connection_likes): connection_likes is the POST-meeting
-- rolodex signal ("I liked someone I sat with"). A pre-event meeting intent is a
-- different concept with different privacy and a different lifecycle — reusing
-- connection_likes would corrupt the rolodex's meaning. Same security posture as
-- the other secret tables: RLS on, NO policies (service-role only), so attendee
-- phones can never read who wants to meet whom. The backend reveals a person's
-- intents only to that person (GET /me), the at-table nudge only to the liker,
-- and mutual matches only after the event ends.
--
-- Directed edge liker -> liked; a pair is MUTUAL when both directions exist.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS meeting_intents (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  liker_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  liked_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, liker_attendee_id, liked_attendee_id)
);

-- No policies: only the backend service-role key can read/write intents.
ALTER TABLE meeting_intents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_meeting_intents_liker
  ON meeting_intents(event_id, liker_attendee_id);
CREATE INDEX IF NOT EXISTS idx_meeting_intents_liked
  ON meeting_intents(event_id, liked_attendee_id);
