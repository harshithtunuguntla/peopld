-- 018_auto_arrive_default_off.sql
-- Auto check-in is now OFF by default. Registering for an event no longer marks
-- someone "arrived" — they stay "registered" until the organizer checks them in
-- (or they self-arrive with the 6-char room code), so the door is a deliberate
-- step. The app always sends an explicit value on create; this aligns the column
-- default for any direct insert and documents the product intent.
--
-- Existing events keep whatever they were configured with — only the DEFAULT for
-- future rows changes. (Migration 002 originally set DEFAULT TRUE.)

ALTER TABLE events
  ALTER COLUMN auto_arrive_on_register SET DEFAULT FALSE;
