-- Migration 013 — Saved contacts (bookmarks)
-- An attendee can explicitly "save" (bookmark) people they met. This is SEPARATE
-- from the auto-rolodex (everyone you sat with) and from the like signal — it's a
-- deliberate "keep this one" shortlist the saver can filter to later. Owner-private:
-- only the saver ever sees their saved list. Service-role only — NO RLS policies.
CREATE TABLE IF NOT EXISTS connection_bookmarks (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner_attendee_id   UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  target_attendee_id  UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, owner_attendee_id, target_attendee_id)
);

ALTER TABLE connection_bookmarks ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
