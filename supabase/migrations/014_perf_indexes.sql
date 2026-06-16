-- Migration 014 — Indexes for the hot event-scoped reads.
--
-- Several live-path queries filter by event_id alone but were only indexed on
-- other columns, forcing sequential scans that grow with the whole event:
--   * connection_likes  → live-stats / analytics (_likes_and_matches)
--   * table_assignments → pair-count history + analytics (filtered by event_id)
--   * meeting_intents    → seating planner (_meeting_intents)
--   * attendees          → /live "my registration" lookup (event_id + user_id)
--
-- Cheap to add, idempotent, and they matter most as the room scales toward the
-- 60-table case. Run after 013.

CREATE INDEX IF NOT EXISTS idx_connection_likes_event
  ON connection_likes(event_id);

CREATE INDEX IF NOT EXISTS idx_table_assignments_event
  ON table_assignments(event_id);

CREATE INDEX IF NOT EXISTS idx_meeting_intents_event
  ON meeting_intents(event_id);

-- Composite for the per-request "who am I in this event" lookup in /live.
CREATE INDEX IF NOT EXISTS idx_attendees_event_user
  ON attendees(event_id, user_id);
