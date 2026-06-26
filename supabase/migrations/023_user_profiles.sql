-- Migration 023 — Global user profiles
-- A single reusable profile per signed-in user (name/role/company/etc.), keyed
-- by their Supabase auth user id — NOT per-event. Captured once (first login,
-- or lazily on first event registration for pre-existing users) and reused as
-- the prefill for every event registration; edits there flow back here, so the
-- profile stays one consistent thing across every event instead of drifting
-- per event. Service-role only — RLS enabled with NO policies (the API is the
-- only writer/reader; identity is resolved from the JWT, never client-supplied).
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       UUID PRIMARY KEY,
  name          TEXT,
  role          TEXT,
  company       TEXT,
  description   TEXT,
  looking_for   TEXT,
  linkedin_url  TEXT,
  website_url   TEXT,
  interests     TEXT[] NOT NULL DEFAULT '{}',
  avatar_url    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
