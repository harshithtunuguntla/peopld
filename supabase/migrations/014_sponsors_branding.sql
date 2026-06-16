-- Migration 014 — Sponsors & event branding
-- Sponsors are shown to attendees during the "dead time" between rounds (and in
-- the pre-event lobby), rotating around the hourglass. The event can also carry a
-- host/brand logo, shown when `show_event_logo` is on (organizer toggle: co-brand
-- vs sponsors-only). Sponsors reach phones via the backend (GET /events/:id/
-- sponsors), NOT client reads — so the table is RLS-on with no policies.

ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS show_event_logo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS sponsors (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  image_url     TEXT,             -- the sponsor logo (a hosted image URL)
  tagline       TEXT,             -- a short blurb shown under the logo
  url           TEXT,             -- sponsor website; tapping the card opens it
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sponsors_event_idx ON sponsors(event_id);

ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;  -- no policies: served by the backend (service-role)
