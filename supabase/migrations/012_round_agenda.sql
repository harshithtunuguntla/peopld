-- Migration 012 — Organizer-authored round agenda
--
-- Lets the organizer name each round's theme (e.g. "Origins", "What you're
-- building"). Stored as an ordered array on the event: index i is the theme for
-- round i+1. Empty array = fall back to the canonical client-side round names, so
-- events created before this migration behave exactly as before.
--
-- Why a column, not a table: the agenda is tiny (a handful of rounds), authored
-- as a unit, and always read as a unit alongside the rest of the event config —
-- the same grain as target_rounds, which already lives here.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS round_topics TEXT[] NOT NULL DEFAULT '{}';
