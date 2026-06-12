-- Migration 001 — tighten RLS (run once in the Supabase SQL Editor)
--
-- Security fix: the original schema allowed anyone holding the public anon
-- key (shipped in the frontend bundle) to read the entire attendees table
-- (names, WhatsApp numbers, LinkedIn) and to write events/attendees rows
-- directly, bypassing the API's dedupe and ownership checks.
--
-- After this migration: all writes and all PII reads go through the FastAPI
-- backend (service-role key). Client keys keep SELECT only on non-PII
-- tables needed for the landing page and Realtime (events, rounds,
-- table_assignments, icebreakers).

DROP POLICY IF EXISTS "attendees_public_read" ON attendees;
DROP POLICY IF EXISTS "attendees_self_insert" ON attendees;
DROP POLICY IF EXISTS "attendees_self_update" ON attendees;
DROP POLICY IF EXISTS "events_organizer_write" ON events;
