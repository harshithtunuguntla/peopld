-- Migration 026 — feedback responses: organizer identity toggle
-- Adds a per-form switch controlling whether the organizer sees WHO submitted
-- each response. We always store `attendee_id` on a submission (needed for
-- resubmit, recap-gating, and response-rate), but when `collect_identity` is
-- FALSE the API withholds the name/company/avatar from the results view so the
-- organizer only sees anonymous responses. Default TRUE: for an intimate event
-- the organizer typically wants to follow up personally.

ALTER TABLE feedback_forms
  ADD COLUMN IF NOT EXISTS collect_identity BOOLEAN NOT NULL DEFAULT TRUE;
