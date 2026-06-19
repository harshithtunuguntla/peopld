-- 017_event_archive.sql
-- Soft-archive for events: let an organizer hide finished or test/dry-run events
-- from their dashboard WITHOUT destroying the data (reversible). This avoids the
-- day-of risk of opening or ending the wrong event amid dashboard clutter — and
-- avoids a destructive cascading delete the week of a live event.
--
-- NULL archived_at = active/visible. A timestamp = archived (hidden by default;
-- still returned to /events/mine?include_archived=true so it can be unarchived).

ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- The dashboard query is "my events, archived or not", so index by owner + flag.
CREATE INDEX IF NOT EXISTS idx_events_organizer_archived
  ON events(organizer_id, archived_at);
