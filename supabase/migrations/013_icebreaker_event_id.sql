-- Migration 013 — Add event_id to icebreakers for per-event Realtime filtering.
--
-- Without this column every icebreaker INSERT globally (any event) triggers a
-- refetch on every subscribed device. With it, the frontend can subscribe with
-- filter: `event_id=eq.<id>` and only receive pings for their own event.
--
-- At 60 attendees: 60 icebreakers × 60 devices = 3 600 refetch calls averted
-- per round publish.

ALTER TABLE icebreakers
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

-- Backfill from the round that owns each icebreaker.
UPDATE icebreakers i
SET    event_id = r.event_id
FROM   rounds r
WHERE  i.round_id = r.id
  AND  i.event_id IS NULL;

-- Index speeds up Realtime filter evaluation and the /live icebreaker lookup.
CREATE INDEX IF NOT EXISTS idx_icebreakers_event_id ON icebreakers(event_id);
