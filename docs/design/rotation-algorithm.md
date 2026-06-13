# Design — Rotation Algorithm (Step 4)

> Agreed in the Step 4 design session (2026-06-12) between the product owner and
> the build agent, per the brainstorm-before-code rule. **Implementation must
> follow this document.** Anything not listed under Scope is out of scope.
>
> **Status: IMPLEMENTED (2026-06-13).** `backend/app/algorithm.py`,
> draft→publish endpoints in `backend/app/routers/rounds.py`, audit trail in
> `backend/app/audit.py`, structured logging in `backend/app/logging_config.py`,
> migration `supabase/migrations/002_step4_rounds.sql`. 111 backend tests pass
> (50 new for Step 4); smoke_live.py extended with the full lifecycle + a
> draft-leak attacker check.

## 1. Goal

When the organizer starts a round, assign every **arrived** attendee to a table
so that people meet as many **new** faces as possible across the event.

**Pure novelty, no interest-matching.** The algorithm optimizes one thing:
minimize repeat pairings. Personalization is the icebreaker engine's job
(Step 6) — two separate concerns, never mixed. Interest-matching was considered
and rejected (overloads scarce roles, causes repeats, hard to explain).

## 2. Decisions (the 10 questions)

| # | Question | Decision |
|---|---|---|
| 1 | Who is seated | Only attendees with status `arrived`. Registration alone is not enough |
| 2 | Organizer seated? | No — organizer is the MC, never in the rotation |
| 3 | Late arrival mid-round | Waits for the next round. Phone shows "you'll be seated next round". No mid-round inserts |
| 4 | Leaves mid-round | Table runs short; tablemates' screens show "(left the event)". No mid-round moves. Excluded from next round's pool |
| 5 | Table sizes | Target = event's `seats_per_table` (default 4). Min 3, max `seats_per_table + 1` (5). Never 2. Remainder handling: 1 left over → one table of 5; 2 left over → two tables of 3; 3 left over → one table of 3 |
| 6 | Fewer people than tables | Fill fewer tables fully; use LOW table numbers (1..N) so physical signage works. Never spread thin |
| 7 | Matching | Pure novelty (see Goal) |
| 8 | Manual seating rules | NOT in pre-MVP. Organizer handles "keep X and Y apart" verbally at a 40-person pilot |
| 9 | Preview | Yes — two-phase: **generate draft → organizer previews → Publish or Regenerate**. Attendee phones update only on publish |
| 10 | Cancel a published round | No. Published is final. The escape hatch is: End Round early → fix arrivals → Start a fresh round |

## 3. Additional decisions (product owner, same session)

- **Event capacity is organizer-configurable, never hardcoded.** `num_tables`,
  `seats_per_table`, `default_round_duration_seconds` already live on the event
  (PATCH-able). The algorithm reads them; "4" is only a default value.
- **Registration happens at the venue** (new app, attendees discover it on-site).
  New event config flag `auto_arrive_on_register` (default `true` for the
  pilot): registering marks you `arrived` immediately. Organizer can toggle the
  flag per event and can always override any attendee's status manually.
- **Audit trail + logging standards** (this is an app for real people):
  - Structured app logs: Python `logging`, JSON lines in production (Cloud Run →
    Cloud Logging picks them up automatically), human-readable in dev. Request
    middleware logs method, path, status, duration, and actor user_id.
  - **Never log PII** — log UUIDs (user_id, attendee_id, event_id), never names,
    emails, or phone numbers.
  - New `audit_log` table records every state-changing organizer/attendee action:
    `(id, event_id, actor_user_id, action, entity_type, entity_id, metadata jsonb, created_at)`.
    Actions: `event.created/updated/ended`, `attendee.registered/status_changed`,
    `round.draft_created/regenerated/published/ended`. RLS: no client access
    (service-role only); organizers can view via a future API if needed.

## 4. Algorithm (greedy, with restarts)

1. **Pool** = attendees with status `arrived` for the event.
2. **History** = pair counts from `table_assignments` of all this event's
   published rounds (active + completed). Two people who shared a table have
   pair_count ≥ 1.
3. **Table plan**: from pool size + `seats_per_table` + min/max rules, compute
   how many tables of which sizes (fewest tables, prefer target size, then the
   remainder table(s) per the table above). Capacity check first (see Edge cases).
4. **Greedy fill**: shuffle the pool; seat each person at the table (with a free
   seat) where they add the fewest repeat pairings; ties broken randomly.
5. **Restarts**: repeat steps 3–4 N times (N=20) with different shuffles; keep
   the arrangement with the lowest total repeat score. At ≤100 attendees this is
   milliseconds.
6. **Determinism for tests**: the random source is injectable/seedable.

Repeat pairings become mathematically unavoidable in later rounds
(8 rounds × 3 new people ≈ 24-30 met, pool may be smaller). The algorithm
minimizes them; the UI must say "mostly new faces", never promise "all new".

## 5. Draft → Publish flow (and why drafts get their own table)

`rounds` and `table_assignments` are **client-readable by design** (Realtime).
If draft assignments were written there, attendee phones could see the seating
before the organizer confirms it. Therefore:

- Drafts live in a new **`round_drafts`** table (one in-progress draft per
  event, assignments as JSONB, RLS: no client access at all).
- `POST /events/:id/rounds/start` → 409 if a draft or active round exists;
  otherwise generates and stores a draft, returns the preview.
- `POST /events/:id/rounds/regenerate` → replaces the existing draft.
- `POST /events/:id/rounds/publish` → atomically creates the `rounds` row
  (status `active`) + `table_assignments` rows, deletes the draft. Realtime
  fires HERE — phones update on publish, exactly as decided.
- **Stale-draft guard**: the draft stores a snapshot hash of the arrived-attendee
  set. If arrivals changed since generation, publish returns 409 with
  "attendance changed — regenerate", so nobody is seated at a ghost table.
- All four endpoints: event-owner only (existing auth pattern).

`rounds.status` stays `('active','completed')` — drafts never touch it, so no
enum migration is needed for rounds.

## 6. Edge cases (all must have tests)

| Scenario | Behavior |
|---|---|
| Fewer than 3 arrived | `start` → 422 "Need at least 3 arrived attendees" |
| Arrived > num_tables × (seats_per_table + 1) | `start` → 422 telling the organizer to raise tables/seats config |
| Double-click Start / Publish | Second call → 409 (one draft, one active round max — enforced in app + DB) |
| Publish with no draft / regenerate with no draft | 404 |
| Start while a round is active | 409 "End the current round first" |
| Attendee marked `left` then returns | Organizer re-marks `arrived` → included from the next round |
| Round ended after 1 minute (chai-break escape hatch) | Those pairings still count as "met" in history — accepted imperfection |
| Person never marked arrived | Never seated; empty rolodex; no error |
| Empty venue tables | Unused table numbers simply have no assignments |

## 7. Out of scope (pre-MVP)

Manual seating constraints (keep-apart lists) · mid-round inserts or moves ·
interest-based matching · cancelling a published round · organizer in rotation
("include me" toggle is a V2 idea) · co-host roles.

## 8. Database migration (002, to be written with the implementation)

- `events.auto_arrive_on_register boolean not null default true`
- `round_drafts` table (no client RLS access)
- `audit_log` table (no client RLS access)
