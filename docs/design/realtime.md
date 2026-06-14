# Realtime & State Recovery — Design (Step 5)

**Status:** IMPLEMENTED (backend contract + recovery endpoint + verification), 2026-06-14
**Frontend subscription wiring:** Step 7 (this doc is the contract it builds against)
**Requires:** migration `supabase/migrations/004_realtime.sql`
**Related:** `pre-mvp.md` §8 (Real-Time Behavior), `docs/design/rotation-replanning.md` (Step 4)

> This is the reference for how attendee phones stay in sync with the live event.
> Read the **one principle** first; everything else follows from it.

---

## The one principle

> **Realtime is a doorbell. REST is the meal.**

A realtime message never carries the data a phone renders. It only says
*"something changed — go re-fetch."* The phone then calls **one** authoritative
endpoint (`GET /events/:id/live`) and renders whatever the server returns.

Why this is the whole design: it makes **three different situations collapse into
one code path** —

1. "I just got a realtime ping"
2. "I just reconnected / woke up / regained network"
3. "I just loaded the page"

…all do the exact same thing: **fetch authoritative state, render it.** No payload
parsing, no client-side state machine trying to apply diffs in order. At 40–70
phones this is trivially cheap and almost impossible to desync.

---

## The guaranteed requirement: REQ-RT-01

> **REQ-RT-01 — Client State Recovery.**
> Any client that **reconnects, refreshes, wakes from sleep, or regains network**
> MUST recover authoritative event state **within 3 seconds.**
>
> Realtime delivery is **best-effort** (messages can be missed). State recovery is
> **guaranteed**. If we nail recovery, attendees experience the system as reliable
> *even when individual realtime messages are dropped.*

This is the north star. Everything below either delivers recovery or makes the
doorbell trigger it.

### Two more reliability requirements (live events are messy)

> **REQ-RT-02 — Round Cancellation / Rollback.** The organizer must be able to
> roll back a mistakenly published round. `POST /rounds/cancel` **deletes** the
> active round + its assignments + icebreakers (vs `/end`, which keeps it in
> history). The bad seating leaves no trace and never pollutes pairing history or
> future planning. Clients re-fetch `/live` and fall back to the prior phase
> (between-rounds, or not-started if it was the only round).

> **REQ-RT-03 — Idempotent Publish.** Publishing is safe to retry. A lost response
> (timeout) or a double-click must resolve to **exactly one** round: a retry
> returns the same active round (`200`), never a duplicate. Enforced by the draft
> being a one-shot token *and* the DB `UNIQUE(event_id, round_number)` constraint
> (a lost publish race returns the winner's round instead of a 500).

---

## How recovery is delivered: the `/live` endpoint

`GET /events/:eventId/live` (auth: attendee's Bearer JWT) returns the **entire**
Live Dashboard state in **one round-trip**, so recovery is a single network call.
The attendee is resolved from the JWT — there is no id in the URL, so there is no
IDOR surface (you can only ever see your own state).

```jsonc
{
  "server_time": "2026-07-01T18:02:11.314Z",   // clock-skew anchor for the countdown
  "event_status": "active",                      // upcoming | active | ended
  "phase": "in_round",                           // not_started | in_round | between_rounds | ended
  "attendee_id": "…",
  "attendee_status": "arrived",                  // registered | arrived | left
  "seated": true,                                // false during a round = no table for you
  "round": {
    "round_id": "…",
    "round_number": 3,
    "status": "active",
    "started_at": "2026-07-01T18:00:00Z",
    "duration_seconds": 300,
    "ends_at": "2026-07-01T18:05:00Z"            // started_at + duration
  },
  "seat": {
    "table_number": 6,
    "tablemates": [                              // names + roles ONLY (no contact PII)
      { "attendee_id": "…", "name": "Anita", "role": "Founder at Acme" },
      { "attendee_id": "…", "name": "Bobby", "role": "Investor at XYZ" }
    ]
  },
  "icebreaker": {                                // null until Step 6 generates it (async)
    "question_text": "Ask Bobby about scaling his team.",
    "target_attendee_id": "…"
  }
}
```

The `phase` is **derived from current data**, not from a stored flag, so the phone
shows the right screen even if it missed the transition that got us here:

| Condition (checked in order) | `phase` |
|---|---|
| event `status == ended` | `ended` |
| an `active` round exists | `in_round` |
| any round exists (all completed) | `between_rounds` |
| otherwise | `not_started` |

`seated` is independent of `phase`: during `in_round` a late arrival gets
`seated:false, seat:null` but still sees the round is running.

---

## Scenario coverage

The live event will throw all of these at us. Each is handled — by the doorbell
principle, the `/live` payload, or an explicit rule.

| # | Scenario | How it's handled |
|---|---|---|
| 1 | **Organizer publishes a round** | Publish writes `rounds` + `table_assignments` (in the realtime publication) → doorbell fires on every phone → each re-fetches `/live` → shows new table. |
| 2 | **Round ended** | `rounds` row updates → doorbell → re-fetch → `phase: between_rounds`. |
| 3 | **Event ended** | `events`/round state change → re-fetch → `phase: ended` → rolodex. (Phones also re-fetch on the next round-table change.) |
| 4 | **Phone asleep during a publish (missed message)** | On wake, the socket reconnects → phone re-fetches `/live` → correct state. REQ-RT-01. |
| 5 | **Tab refresh / browser restart** | First load = the same `/live` fetch as recovery. One code path. |
| 6 | **Network loss / flaky wifi** | On reconnect, re-fetch. While disconnected, the **polling fallback** keeps state fresh (below). |
| 7 | **Out-of-order / duplicate messages** | **Signals never mutate state — they only trigger a re-fetch.** So order doesn't matter: whatever the server says on the next `/live` wins. No client-side stale-message logic to get wrong. |
| 15 | **Organizer published the wrong seating (rollback)** | `POST /rounds/cancel` (REQ-RT-02) deletes the round + assignments → doorbell → phones re-fetch → prior phase. Pairing history stays clean (the cancelled round never happened). |
| 16 | **Organizer double-clicks / publish times out** | Idempotent publish (REQ-RT-03): one round, retries return it. No "Round 4, Round 4, Round 4". |
| 17 | **Same person on phone + laptop + 2nd tab** | Every device fetches `/live`; the server is the single source, so they converge. (Explicitly tested.) |
| 18 | **Device clock is hours wrong** | Server returns *absolute* `started_at` / `ends_at` / `server_time`; the phone uses only its own skew vs `server_time`. It never trusts its local wall clock, so a 2-hour-wrong cheap Android still counts down correctly. |
| 19 | **Venue internet dies entirely (realtime AND HTTP down)** | **Out of scope by decision** (matches `pre-mvp.md`: no offline fallback). The last-rendered state stays on screen (offline *viewing*), but there is **no offline *synchronization*** — see the explicit statement below. |
| 8 | **Late arrival (round already running)** | `/live` returns `phase: in_round, seated: false` → "no table this round, see the organizer." |
| 9 | **Between rounds (round ended, next not started)** | `phase: between_rounds` → "round over, get ready." Not a stale table. |
| 10 | **Synchronized countdown** | Server sends `started_at` + `duration_seconds` + `server_time` once; each phone counts down **locally**, corrected for clock skew. NOT streamed (see below). |
| 11 | **Websocket blocked entirely (corporate/hotel wifi)** | Polling fallback every ~10–15 s → never goes stale, even with realtime fully down. |
| 12 | **Future rounds must not leak** | `round_drafts` + `round_plans` are service-role only and explicitly **kept out** of the realtime publication (migration 004 drops them defensively). |
| 13 | **No PII on the wire** | Published tables carry IDs + table numbers + question text only; `attendees` (names/contacts) is never published. Names resolve via the authenticated `/live`. |
| 14 | **Connection budget** | One channel/connection per phone (~70) vs free-tier ~200 cap. |

### Synchronized countdown — why we don't stream it (scenario 10)

Streaming timer ticks over realtime would mean *70 phones × ticks/sec* (connection
death) and they'd **still drift**. Instead: the server sends `started_at`,
`duration_seconds`, and `server_time` **once** in `/live`. Each phone computes

```
skew      = server_time − device_clock_now      (captured at fetch)
remaining = (started_at + duration_seconds) − (device_clock_now + skew)
```

and ticks its own local clock. All phones agree because they share the server's
clock, not their own. Re-syncs for free on every `/live` fetch.

### Polling fallback — the reliability insurance (scenarios 6, 11)

Realtime is best-effort; for a live event we can't debug 40 phones. So the phone
**also** polls `/live` on a slow timer (~10–15 s) whenever the websocket isn't
connected. Belt and suspenders: worst case (realtime totally down) the dashboard
is at most ~15 s stale and still self-heals. This is the "reliability over
cleverness" call.

### Offline boundary — say it out loud (scenario 19)

If the venue's internet dies completely (websocket **and** HTTP both unreachable),
we cannot sync. To set expectations honestly:

> **Offline viewing is supported. Offline synchronization is NOT.**

The last-rendered `/live` state stays on the screen (the attendee can still read
their current table), but the app cannot learn about new rounds until connectivity
returns — at which point recovery (REQ-RT-01) kicks in and it catches up in one
fetch. This matches `pre-mvp.md` §4 ("Offline fallback" is explicitly out of
scope). We document it so nobody assumes more than exists.

---

## Channel structure (the frontend↔backend contract)

**Decision: one channel per event; every phone subscribes to it.** ("event bus")

The phone opens a single Supabase Realtime channel scoped to its `event_id`,
listening for changes on `rounds`, `table_assignments`, and `icebreakers` for that
event. Any change → re-fetch `/live`. The phone filters "is this about me?" *after*
re-fetching (the payload already tells it).

Why this over per-attendee channels:
- **1 connection per phone** — stays well under the free-tier ~200 cap at ~70 attendees.
- Matches the doorbell model perfectly: the phone doesn't need fine-grained
  targeting because it re-fetches the authoritative snapshot anyway.
- Simplest possible wiring → fewest live-event failure modes.

This is the expensive-to-change contract, so it's stated explicitly here. Frontend
(Step 7) builds against exactly this.

---

## What rides on realtime (and what never does)

**In the publication** (`supabase_realtime`) — client-readable, PII-free:
- `rounds` — round lifecycle (started/ended). IDs, numbers, timestamps, status.
- `table_assignments` — who-sits-where. `attendee_id` + `table_number` only.
- `icebreakers` — question text (no contact info).

**`REPLICA IDENTITY FULL`** is set on all three (migration 004). This is not
optional: phones subscribe filtered by `event_id`, and a Postgres DELETE event
only carries the primary key by default — so a cancelled round (REQ-RT-02, a
DELETE) would be **invisible** to a filtered subscriber without it. FULL makes
DELETE/UPDATE carry the whole old row, so the cancel doorbell rings immediately.

**NEVER in the publication:**
- `attendees` — names, WhatsApp, LinkedIn (PII). Names resolve via authenticated `/live`.
- `round_drafts`, `round_plans` — *future* seatings; service-role only. Migration
  004 drops them from the publication defensively in case anything added them.

This is enforced by RLS (`schema.sql`) **and** verified by the smoke test (anon key
can read `table_assignments` but not `attendees`, and rows carry no `name`).

---

## What about the organizer's screen?

The organizer's Live Control Panel is **not** on the realtime path. It shows the
attendee list (arrived/left) and round status — and the attendee list lives in
`attendees`, which is deliberately **not** published (PII). The organizer is also
the one *causing* state changes, so they already know the current state. The panel
re-reads the authenticated endpoints (`GET /attendees`, `GET /rounds/current`) on
action and on a light refresh; it does not need a realtime subscription for the
pilot. (Live arrival counts via realtime would require a PII-free presence signal —
that's the deferred Presence feature, out of scope.)

## Sequence diagrams

**Happy path — organizer publishes:**
```
Organizer        Backend            Postgres/Realtime         Attendee phone
   │  POST /rounds/publish │                │                        │
   │──────────────────────▶│ insert round + assignments             │
   │                       │───────────────▶│                        │
   │                       │                │── change event ───────▶│ (doorbell)
   │                       │                │                        │ GET /live
   │                       │◀───────────────────────────────────────│
   │                       │  full snapshot ─────────────────────────▶ render Table 6
```

**Recovery — phone was asleep (REQ-RT-01):**
```
Attendee phone                         Backend
   │ (wakes; websocket reconnects)        │
   │ GET /events/:id/live ────────────────▶│
   │◀──────────────── full snapshot ───────│  ≤ 3s
   │ render authoritative state (whatever it missed is now correct)
```

---

## Explicitly OUT of scope (Pre-MVP)

Per `pre-mvp.md` §4 ("What Is NOT in the Pre-MVP") and the build-spec-is-law rule:

- **Announcements / broadcast messages** — no such feature in Pre-MVP.
- **1:1 meeting requests / "match accepted"** — MVP territory, not Pre-MVP.
- **Presence (online/offline indicators)** — costs connections + complexity for no
  Pre-MVP value; deferred.

The doorbell architecture doesn't *preclude* any of these later — adding a signal
is "add a table to the publication + one more case in `/live`." Designed right now,
free to extend later, without building anything out of scope today.

---

## Implementation

**Backend (done):**
- `backend/app/routers/live.py` — `GET /events/:id/live` recovery endpoint.
- `backend/app/routers/rounds.py` — `POST /rounds/cancel` (REQ-RT-02) + idempotent
  `POST /rounds/publish` (REQ-RT-03).
- `backend/app/models/schemas.py` — `LiveStateResponse` + `LiveRound` / `LiveSeat`
  / `Tablemate` / `LiveIcebreaker`; `RoundCancelResponse`.
- `supabase/migrations/004_realtime.sql` — idempotent publication (adds the three
  attendee-facing tables; drops drafts/plans/attendees defensively).

**Frontend (Step 7) — build to this contract:**
1. On mount: `GET /live`, render by `phase`.
2. Subscribe to one Supabase channel for the `event_id` (the three tables above).
3. On *any* realtime event: re-fetch `/live` (debounced). **Never apply the
   payload directly** — signals only trigger a re-fetch; the server is authority.
   (This removes the entire stale/out-of-order/cancelled-round message class.)
4. On reconnect / visibility-change / online event: re-fetch `/live` (REQ-RT-01).
5. Poll `/live` every ~10–15 s while the websocket is disconnected (fallback).
6. Countdown: derive locally from `started_at` + `duration_seconds` + `server_time`.

---

## Verification

- **Unit:** `backend/tests/test_live.py` — every phase (not_started / in_round /
  between_rounds / ended), seated vs late-arrival, JWT-resolved identity (no IDOR),
  PII-free payload, icebreaker present/absent, clock-skew absolute timestamps,
  multi-device convergence, post-cancel recovery. `backend/tests/test_rounds.py` —
  idempotent publish (REQ-RT-03) and cancel/rollback (REQ-RT-02, incl. no leftover
  pairing history).
- **Live smoke:** `backend/scripts/smoke_live.py` §6b — drives `/live` against the
  real Supabase: asserts `phase`/`seated`/countdown fields, **measures recovery
  latency against the 3 s REQ-RT-01 budget**, asserts no contact PII in the payload,
  and confirms the anon key can read `table_assignments` (doorbell works) but not
  `attendees` (no PII leak).
- **Websocket round-trip** (a real subscriber receiving a publish within budget) is
  exercised end-to-end by the Step 7 frontend; the backend guarantees the doorbell
  fires (publication membership) and the recovery payload.
