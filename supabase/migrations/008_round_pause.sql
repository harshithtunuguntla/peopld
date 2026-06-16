-- 008: Round pause/resume support
--
-- The live countdown is derived from `started_at + duration_seconds`. To pause a
-- round (e.g. the host wants to make an announcement) without rewriting history,
-- we track paused time and shift the effective end forward:
--
--   effective_ends_at = started_at + duration_seconds + total_paused_seconds
--
-- `paused_at` is set while a round is currently paused (null when running). On
-- resume we add (now - paused_at) into `total_paused_seconds` and clear it. While
-- paused, clients freeze the displayed remaining at (ends_at - paused_at).
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS total_paused_seconds INTEGER NOT NULL DEFAULT 0;
