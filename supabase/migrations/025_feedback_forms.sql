-- Migration 025 — Customizable post-event feedback forms (Google-Forms-style)
-- Supersedes the dummy 1-5 `event_feedback` (024), which is left in place for
-- back-compat. Organizers build a custom form per event (any mix of question
-- types), optionally GATE the attendee's recap behind submitting it, and review
-- aggregated results in the console.
--
-- All tables are service-role only (RLS enabled, no policies) — every read/write
-- goes through the API, which enforces owner-only vs attendee access in app code.

-- One form per event. The form is a draft until `is_published`; `gate_recap`
-- decides whether an attendee must submit before their wrap/recap unlocks.
CREATE TABLE IF NOT EXISTS feedback_forms (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'Event feedback',
  description   TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  gate_recap    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordered questions. `type` ∈ short_text | long_text | single_choice |
-- multi_choice | rating | nps | yes_no. `options` holds the choices for choice
-- types (JSON array of strings) and config for rating (e.g. {"scale": 5}).
CREATE TABLE IF NOT EXISTS feedback_questions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id       UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
  position      INT NOT NULL DEFAULT 0,
  type          TEXT NOT NULL,
  label         TEXT NOT NULL,
  help_text     TEXT,
  required      BOOLEAN NOT NULL DEFAULT FALSE,
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_questions_form ON feedback_questions(form_id, position);

-- One submission per attendee per form (resubmitting replaces the answers).
CREATE TABLE IF NOT EXISTS feedback_submissions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id       UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id   UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, attendee_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_form ON feedback_submissions(form_id);

-- One answer per question per submission. `value` is JSON: a string (text /
-- yes_no / single_choice), a number (rating / nps), or an array of strings
-- (multi_choice) — so a single column fits every question type.
CREATE TABLE IF NOT EXISTS feedback_answers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES feedback_questions(id) ON DELETE CASCADE,
  value         JSONB NOT NULL DEFAULT '""'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_feedback_answers_submission ON feedback_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_feedback_answers_question ON feedback_answers(question_id);

ALTER TABLE feedback_forms ENABLE ROW LEVEL SECURITY;        -- no policies: service-role only
ALTER TABLE feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_answers ENABLE ROW LEVEL SECURITY;
