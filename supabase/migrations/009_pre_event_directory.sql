-- Migration 009 — richer attendee profiles + the pre-event directory
--
-- WHY:
--  Phase 1 of the pre-event experience: people register ahead of time and can
--  browse who else is coming. That needs a fuller, market-facing profile and a
--  couple of directory controls.
--
--  Profile fields (all public, shown on the directory + table cards):
--    * company       — where they work / what they're building
--    * description   — a short "what are you doing right now" line/paragraph
--    * website_url   — personal site / product link
--  (name, role, linkedin_url, interests, avatar_url already exist.)
--
--  Directory controls:
--    * show_in_directory — per-attendee opt-out of the public list (default on)
--    * tag              — attendee | speaker | host, for filtering the directory.
--                         Organizer-assigned; defaults to 'attendee'.
--
--  REMOVED:
--    * whatsapp_number — we no longer collect a phone number anywhere. Contact is
--      LinkedIn + website. (Supersedes the old "WhatsApp-first" decision; see
--      PRODUCT.md Decision Log 2026-06-16.) Dropped here and from every API surface.
--
-- Idempotent: safe to re-run.

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS company         TEXT;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS website_url     TEXT;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS show_in_directory BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS tag             TEXT NOT NULL DEFAULT 'attendee';

-- Constrain tag to the known set (added separately so the migration stays
-- re-runnable even if the column already existed without the check).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendees_tag_check'
  ) THEN
    ALTER TABLE attendees
      ADD CONSTRAINT attendees_tag_check CHECK (tag IN ('attendee', 'speaker', 'host'));
  END IF;
END $$;

ALTER TABLE attendees DROP COLUMN IF EXISTS whatsapp_number;
