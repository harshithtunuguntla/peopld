-- Migration 006 — profile photos + connection likes (Step 7 attendee experience)
--
-- WHY:
--  * avatar_url: capture the OAuth (Google) profile photo at registration so name
--    cards across the app show a real face, falling back to colored initials for
--    email-OTP attendees. Lives on attendees (already service-role-only, never
--    client-readable) — no new exposure.
--  * connection_likes: an attendee can "like" a tablemate during a live round.
--    Surfaced in the post-event rolodex (mutual likes = a "match"). These are
--    private signals, so the table is service-role only (no policies), matching
--    round_drafts / round_plans / event_access_codes.
--
-- Idempotent: safe to re-run.

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS connection_likes (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  liker_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  liked_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, liker_attendee_id, liked_attendee_id)
);

-- No policies: only the backend service-role key can read/write likes.
ALTER TABLE connection_likes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_connection_likes_liker
  ON connection_likes(event_id, liker_attendee_id);
CREATE INDEX IF NOT EXISTS idx_connection_likes_liked
  ON connection_likes(event_id, liked_attendee_id);
