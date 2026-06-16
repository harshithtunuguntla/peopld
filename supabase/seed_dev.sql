-- ────────────────────────────────────────────────────────────────────────────
-- DEV-ONLY seed: guarantees an event "Peopld Dev Test Meet" exists with a fixed,
-- friendly access code for testing the attendee join flow end-to-end.
--
--   Access code it creates:  MEET25
--
-- Robust by design: it will NOT silently do nothing.
--   • Organizer = your email if found, else the most recent auth user.
--   • Raises a clear error if there are no users yet (sign in once as organizer).
--   • Reuses the dev event if it already exists; (re)sets the code either way.
-- Safe to re-run. Requires migrations 001–007 applied.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  org uuid;
  ev  uuid;
begin
  -- 1. Pick the organizer. Set your email below (optional); otherwise we fall
  --    back to the most recently created user so this always resolves.
  select id into org from auth.users
   where email = 'harshithtunuguntla@gmail.com'   -- 👈 your organizer email (optional)
   limit 1;

  if org is null then
    select id into org from auth.users order by created_at desc limit 1;
  end if;

  if org is null then
    raise exception 'No auth.users found — sign in once at /organizer/login first, then re-run.';
  end if;

  -- 2. Reuse the dev event if present, else create it.
  select id into ev from events where name = 'Peopld Dev Test Meet' limit 1;

  if ev is null then
    insert into events
      (name, date, time, location, num_tables, seats_per_table,
       target_rounds, default_round_duration_seconds, organizer_id, status)
    values
      ('Peopld Dev Test Meet', current_date, '19:00', 'Hyderabad · Dev Room',
       6, 4, 4, 300, org, 'upcoming')
    returning id into ev;
  end if;

  -- 3. Set the access code (idempotent).
  insert into event_access_codes (event_id, code)
  values (ev, 'MEET25')
  on conflict (event_id) do update set code = excluded.code;

  raise notice 'Dev event ready: % with code MEET25', ev;
end $$;

-- Confirm — should return the event + code MEET25.
select e.id, e.name, e.status, c.code
from events e
join event_access_codes c on c.event_id = e.id
where e.name = 'Peopld Dev Test Meet';
