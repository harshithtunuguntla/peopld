-- 029_backfill_attendee_email.sql
-- Migration 028 added attendees.email, and registration now captures the signed-in
-- account's email on each new attendee row. But attendees who registered BEFORE
-- that change have a null email, so their rolodex / directory card shows no mail
-- glyph and their vCard carries no EMAIL line.
--
-- Backfill those rows from the auth identity. Walk-ins (user_id IS NULL) have no
-- account and correctly stay null. Idempotent — only touches rows still missing an
-- email, so it's safe to re-run.
UPDATE attendees a
SET email = u.email
FROM auth.users u
WHERE a.user_id = u.id
  AND a.user_id IS NOT NULL
  AND (a.email IS NULL OR a.email = '')
  AND u.email IS NOT NULL;
