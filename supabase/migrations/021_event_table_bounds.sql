-- 021_event_table_bounds.sql
-- Optional organizer control over table sizes. The seating planner already
-- distributes leftovers gracefully (e.g. 32 people at 3/table → two tables of 4,
-- eight of 3 — never a lonely 2). These columns let an organizer override the
-- floor and ceiling explicitly. NULL = use the defaults (min 3, max seats+1), so
-- existing events are unchanged.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS min_per_table INTEGER,
  ADD COLUMN IF NOT EXISTS max_per_table INTEGER;
