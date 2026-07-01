-- Migration 028 — Attendee contact channels (WhatsApp / Instagram / X / email)
-- Adds optional personal contact fields to the per-event attendee row AND the
-- reusable global profile, so they prefill the next registration like every
-- other profile field.
--
-- Privacy model (enforced in app code, not just the UI):
--   * phone is the WhatsApp number. It is PII, so it is gated by `phone_visible`
--     — the connections API only includes it when the OWNER opted in. Default
--     FALSE (private until you tick "let everyone at this event see it").
--   * instagram / twitter (X) / email are shown to anyone who has you in their
--     rolodex, like the existing LinkedIn/website links. Never in the PUBLIC
--     pre-event directory (that stays professional-links-only).
--   * email is the account's sign-in address, captured on the attendee row at
--     registration so the rolodex can show it without a per-view auth lookup.
--     Walk-ins (no account) have no email.
--
-- phone is split into a dial code (+91 default, India) + local number so the
-- WhatsApp deep link is always built from a country-qualified number and the
-- edit form can re-select the right country.

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS phone_dial_code  TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS phone_visible    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS instagram        TEXT,
  ADD COLUMN IF NOT EXISTS twitter          TEXT,
  ADD COLUMN IF NOT EXISTS email            TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS phone_dial_code  TEXT DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS phone_visible    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS instagram        TEXT,
  ADD COLUMN IF NOT EXISTS twitter          TEXT;
