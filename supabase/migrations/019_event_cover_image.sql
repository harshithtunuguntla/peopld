-- 019_event_cover_image.sql
-- Optional hero image for an event card. URL only — same approach as logo_url,
-- avatar_url, and sponsor image_url (no Supabase Storage bucket / upload). When
-- empty, the dashboard falls back to a deterministic per-event color so cards are
-- never blank.

ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
