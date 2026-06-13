# Rotation Algorithm v2 — Re-planning Optimizer

**Status:** IMPLEMENTED (engine + lifecycle + tests), 2026-06-13
**Supersedes the engine in:** `docs/design/rotation-algorithm.md` (greedy v1 stays as fallback)
**Requires:** migration `supabase/migrations/003_replanning.sql` (adds `round_plans`, `events.target_rounds`)

## Why

Greedy (v1) seats one round at a time to minimize *that round's* repeats. It is
robust and online, but myopic: it commits early rounds without knowing they
force repeats later, and it can never undo them. Benchmarking against a strong
optimizer (simulated annealing) showed greedy leaves real overlap on the table —
up to ~50% more repeat-pairings than achievable in the mid-size rooms where real
events live, and it misses *zero-overlap* schedules that exist at pilot length.

Validation harness: `backend/scripts/compare_algorithms.py` (greedy vs re-plan
across 10+ room shapes, stable + churn). Re-planning matched the offline optimum
and beat greedy in every scenario once the strategy was right (see below).

## The engine: simulated-annealing planner

`algorithm.plan_rounds(arrived_ids, pair_counts, num_tables, seats_per_table,
horizon, ...) -> RotationPlan` produces a **multi-round** plan (a list of
seatings) that minimizes **total** repeat-pairings over the horizon, given the
pair history so far.

- **Objective:** total repeat-pairings = Σ over pairs of max(times_together − 1, 0).
- **Warm start:** greedy-with-restarts (same quality as v1) so SA can only ever
  *improve* on greedy, never report worse.
- **Move:** swap two people at different tables in the same round (table sizes
  fixed by `plan_table_sizes`). Metropolis acceptance escapes local optima.
- **Implementation:** integer ids + a flat co-seat matrix (fast at 1000 people).
- **Safety:** time-bounded (`time_budget_s`) and iteration-capped so it can never
  hang the organizer console; falls back to the greedy warm start if interrupted.
- **Deterministic** for a seeded RNG.

## The strategy: plan once, follow, re-plan on roster change

The crucial finding: re-planning *every round and committing only the first round*
is **wrong** — the optimizer sacrifices early rounds to clean up later ones, but
if we discard and re-plan those later rounds each time, we keep paying the
sacrifices and never collect the payoff. In tests that made re-planning *worse*
than greedy.

Correct strategy (and it's also cheaper):

1. At the first round, plan the whole remaining horizon for the arrived set.
2. **Follow** that plan round by round.
3. **Re-plan the remaining rounds only when the arrived set actually changes**
   (someone arrived late or left early since the plan was made).

On a stable roster this plans once and follows it = the offline optimum. Under
churn it re-plans a handful of times, keeping most of the optimal structure.
This is how late arrivals / early leavers are handled — for free, by re-planning
from whoever is actually present.

## Lifecycle integration (BUILT — `backend/app/routers/rounds.py`)

State: a per-event **plan cache** — `round_plans` table, service-role only, like
`round_drafts`: `{ event_id UNIQUE, plan JSONB, planned_for_hash,
horizon_start_round, created_at }`. `round_drafts` is unchanged and still holds
the materialized *current* round preview, so the publish flow is untouched.

- **start (round k):** compute arrived set + hash. If a cached plan matches the
  hash and still covers round k → materialize `plan[k − horizon_start]` into
  `round_drafts` (unchanged table) as the preview. Else re-plan, cache it,
  materialize round k. Publish flow is **unchanged** (still reads `round_drafts`).
- **regenerate:** force a re-plan (new RNG seed).
- **publish / end:** unchanged from v1.
- **horizon:** from an event setting `target_rounds` (organizer's intended round
  count), default = novelty ceiling `ceil((N−1)/(seats−1))` capped at a sane max.
- **stale guard:** v1's arrived-set+config hash check stays; a change forces
  regenerate → re-plan.

## Decisions / defaults (flag for review)

- Greedy v1 kept as the **fallback** if the planner errors or times out.
- Live performance: pilot scale (≤70) plans in well under a second. The planner
  is validated to 1000 people; at that scale we cap restarts/iters under the time
  budget. The pilot does not need 1000-person live speed — this is future-proofing.
- `opt*` in the harness is an *approximate* optimum (SA, not exact); re-plan
  occasionally edges it out due to RNG — both sit on the true optimum.
