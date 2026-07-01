-- Migration 030 — Manually-added connections ("Add someone you met")
-- People you meet in the hallway / at coffee aren't seated at your table, so the
-- auto-rolodex never captures them. This lets an attendee jot someone down by hand
-- (ideally by voice) so they land in the same cross-event "My connections" rolodex,
-- searchable and saveable, instead of getting lost in the phone's contact list.
--
-- Owner-scoped to the USER (not an attendee row): the rolodex is cross-event, so a
-- hand-added person belongs to you, optionally tagged with the event you met them at.
-- Service-role only — RLS on, NO policies (matches every other table in this app).
CREATE TABLE IF NOT EXISTS manual_connections (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional "met at" context. Nulled (not cascaded away) if the event is deleted,
  -- so the contact you saved survives even if the event record doesn't.
  event_id         UUID REFERENCES events(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  role             TEXT,
  company          TEXT,
  phone            TEXT,
  phone_dial_code  TEXT,
  email            TEXT,
  instagram        TEXT,
  twitter          TEXT,
  linkedin_url     TEXT,
  website_url      TEXT,
  note             TEXT,          -- the voice transcript / freeform memory jog
  met_context      TEXT,          -- freeform "at the coffee bar", "intro'd by Priya"
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The one hot path: "give me everyone I've added" on the rolodex.
CREATE INDEX IF NOT EXISTS idx_manual_connections_owner
  ON manual_connections (owner_user_id);

ALTER TABLE manual_connections ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
