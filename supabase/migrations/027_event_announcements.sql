-- Migration 027 — organizer live announcements (broadcast a message to the room)
-- The organizer can push a short message ("Pizza's here", "Move to the patio for
-- round 3") to every attendee's screen during the event. Persisted (not just an
-- ephemeral broadcast) so a phone that was asleep/offline still sees the latest
-- one when it comes back — the attendee reads the latest via the /live snapshot,
-- deduping by id. Service-role only (RLS on, no policies); the API enforces
-- owner-only create + participant-only read (via /live).

CREATE TABLE IF NOT EXISTS event_announcements (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- "latest announcement for this event" is the only read pattern.
CREATE INDEX IF NOT EXISTS idx_event_announcements_event ON event_announcements(event_id, created_at DESC);

ALTER TABLE event_announcements ENABLE ROW LEVEL SECURITY;  -- service-role only
