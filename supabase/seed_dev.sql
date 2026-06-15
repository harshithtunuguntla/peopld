-- ────────────────────────────────────────────────────────────────────────────
-- DEV-ONLY seed: one demo event + a fixed, friendly access code for testing the
-- attendee join flow end-to-end. Run in the Supabase SQL editor.
--
--   Access code it creates:  MEET25
--
-- ⚠️  Replace the email below with YOUR organizer account's email (the one you
--     use at /organizer/login). events.organizer_id must point at a real user.
-- ⚠️  Requires migrations 001–007 to be applied first.
-- Safe to re-run: it clears any prior "Peopld Dev Test Meet" before re-seeding.
-- ────────────────────────────────────────────────────────────────────────────

-- Clean up a previous dev seed (cascades to its access code + attendees).
delete from events where name = 'Peopld Dev Test Meet';

with org as (
  select id from auth.users
  where email = 'redof85@gmail.com'      -- 👈 your organizer email
  limit 1
),
ev as (
  insert into events
    (name, date, time, location, num_tables, seats_per_table, target_rounds, organizer_id, status)
  select
    'Peopld Dev Test Meet', current_date, '19:00', 'Hyderabad · Dev Room',
    6, 4, 4, org.id, 'upcoming'
  from org
  returning id
)
insert into event_access_codes (event_id, code)
select id, 'MEET25' from ev;

-- Confirm it worked — should return the event + code MEET25.
select e.id, e.name, e.status, c.code
from events e
join event_access_codes c on c.event_id = e.id
where e.name = 'Peopld Dev Test Meet';
