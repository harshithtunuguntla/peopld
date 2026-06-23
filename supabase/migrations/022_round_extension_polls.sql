-- Migration 022 — checked-in attendee poll for extending the current round.
-- Votes are private service-role data. Attendee phones only receive aggregates
-- plus their own vote through GET /events/:id/live.

CREATE TABLE IF NOT EXISTS round_extension_polls (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_id          UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'extended', 'rejected')),
  eligible_count    INTEGER NOT NULL CHECK (eligible_count > 0),
  threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (threshold_percent > 0 AND threshold_percent <= 100),
  selected_seconds  INTEGER CHECK (selected_seconds IN (120, 180, 300)),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS round_extension_votes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id     UUID NOT NULL REFERENCES round_extension_polls(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  seconds     INTEGER NOT NULL CHECK (seconds IN (0, 120, 180, 300)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, attendee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_round_extension_polls_one_active
  ON round_extension_polls(round_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_round_extension_polls_one_success
  ON round_extension_polls(round_id)
  WHERE status = 'extended';

CREATE INDEX IF NOT EXISTS idx_round_extension_polls_round
  ON round_extension_polls(round_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_round_extension_votes_poll
  ON round_extension_votes(poll_id);

ALTER TABLE round_extension_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_extension_votes ENABLE ROW LEVEL SECURITY;

-- No RLS policies: backend service-role only.
