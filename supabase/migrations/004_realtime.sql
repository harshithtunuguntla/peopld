-- Migration 004 — Step 5: Supabase Realtime publication
--
-- Realtime is a DOORBELL, not the source of truth. Attendee phones subscribe to
-- these tables only to learn "something changed", then re-fetch authoritative
-- state from GET /events/:id/live (REQ-RT-01 — recovery within 3 seconds).
--
-- PII RULE: the published tables carry IDs + table numbers + question text ONLY.
-- The attendees table (names, WhatsApp, LinkedIn) is NEVER published — names are
-- resolved through the authenticated backend, never over the realtime channel.
--
-- Idempotent: safe to run even though schema.sql already adds these tables
-- (a fresh project gets them from schema.sql; an older project gets them here).

-- 1. Ensure the attendee-facing tables ARE in the realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'table_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE table_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'icebreakers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE icebreakers;
  END IF;
END $$;

-- 2. Belt-and-suspenders: future seatings must NEVER reach a phone. round_drafts
-- and round_plans are service-role only (no RLS policies) AND must stay OUT of
-- the realtime publication. Drop them defensively if anything ever added them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'round_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE round_drafts;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'round_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE round_plans;
  END IF;

  -- attendees holds PII — must never be published, even by accident.
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attendees'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE attendees;
  END IF;
END $$;

-- 3. REPLICA IDENTITY FULL — REQUIRED for round cancel/rollback (REQ-RT-02).
-- Phones subscribe filtered by event_id. By default a DELETE event only carries
-- the primary key, so a filter like `event_id=eq.X` would NOT match a delete and
-- the phone would miss a cancelled round (until the slow polling fallback). FULL
-- makes DELETE/UPDATE events carry the whole old row (incl. event_id), so the
-- doorbell rings on cancel immediately. Negligible WAL cost at our scale.
ALTER TABLE rounds            REPLICA IDENTITY FULL;
ALTER TABLE table_assignments REPLICA IDENTITY FULL;
ALTER TABLE icebreakers       REPLICA IDENTITY FULL;
