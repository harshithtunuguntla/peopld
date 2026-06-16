-- Migration 010 — Per-event ROOM code (self-service day-of check-in)
--
-- Phase 2 of the pre-event experience. People pre-register from home (status
-- 'registered', auto_arrive off). On the day they flip themselves to 'arrived'
-- by typing a short ROOM code the organizer reveals in the room — no door queue,
-- no organizer tapping 40 names.
--
-- WHY A SECOND, SEPARATE CODE (not the join/access code): the join code is
-- shareable in advance (it goes in the invite). The room code must NOT be —
-- otherwise a no-show could mark themselves "arrived" from their couch. So it is
-- a different secret, revealed only at the venue.
--
-- WHY ITS OWN TABLE (not a column on events, not on event_access_codes):
--  * events is anon-readable (public landing page) — a column there leaks.
--  * event_access_codes is cleared by DELETEing the row; sharing it would mean
--    clearing the join code also wipes the room code. Independent tables, zero
--    coupling. Same security posture as event_access_codes: RLS on, NO policies,
--    so it is service-role only and attendee phones can never read it. The
--    backend reads it to verify POST /attendees/me/arrive and returns the value
--    only to the owning organizer via GET /events/:id/room-code.
--
-- One code per event (PK on event_id). No row = check-in not open yet.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS event_room_codes (
  event_id   UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only: RLS on, zero policies (same posture as event_access_codes).
ALTER TABLE event_room_codes ENABLE ROW LEVEL SECURITY;
