-- 020_event_auto_advance.sql
-- Round lifecycle: publishing a round now reveals the seating WITHOUT starting
-- the clock (started_at stays null until the organizer hits "Start round"), so
-- people have time to find their seats. When a round's timer runs out, the
-- organizer console ends it automatically on its poll IF this toggle is on; the
-- manual "End round" tap always works regardless. Default ON.
--
-- Existing events get auto_advance = TRUE (the safe, hands-off default).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT TRUE;
