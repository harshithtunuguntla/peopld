-- Migration 022 — Book-a-demo leads
-- Captures "book a demo" submissions from the public marketing site. Written by
-- the backend with the service-role key; never read by the client. Service-role
-- only — RLS enabled with NO policies, so anon/auth roles cannot read or write it
-- (the anonymous form posts through our API, not straight to PostgREST).
CREATE TABLE IF NOT EXISTS demo_requests (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
