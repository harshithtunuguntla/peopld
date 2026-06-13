# Rotation Algorithm: v1 vs v2 — What Changed and Why

A plain-English explainer of the seating engine that powers the event: the
algorithm we **used to run**, the one we run **now**, what each is called, how
they work, and head-to-head results across many room shapes. Written so a
teammate (or a future you) can understand the decision without re-deriving it.

> TL;DR — We replaced a **myopic greedy** seater with a **lookahead planner**
> (simulated annealing + re-planning). Across 14 room shapes (12–1000 people),
> the planner produces **equal-or-less overlap in every case**, with the biggest
> wins in the mid-size band where real events live (40–80 people: up to ~88%
> less overlap; at pilot length it reaches *zero* repeats). It scales to 1000
> people in seconds and handles people arriving late / leaving early.

---

## The problem we're actually solving

Every round, seat everyone at tables so people meet **as many NEW faces as
possible** — i.e. minimize **repeat pairings** (two people seated together who
already shared a table in an earlier round). This is a known, studied problem:
the **Social Golfer Problem** (schedule groups over rounds so pairs don't
repeat), closely related to **resolvable combinatorial designs**.

The single number we optimize and report everywhere:

> **Total repeat-pairings** = Σ over all pairs of `max(times_seated_together − 1, 0)`.
> Lower = less overlap = better mixing.

Two real-world constraints make it harder than the textbook version:
1. **Online**: people arrive late and leave early, so "who's in the room"
   changes between rounds.
2. **Live & paced**: the organizer runs rounds one at a time (~5 min each); we
   can't show future rounds to attendees.

---

## v1 — "Greedy Restart Optimizer" (what we used to run)

**Family:** greedy heuristic, online, myopic (one round at a time).
**Code:** `app.algorithm.generate_rotation` (still present as the fallback).

**How it works:** for the round in front of it, it shuffles the arrived people
and seats them one by one, each time choosing the table that adds the fewest
repeats *given who they've already met*. It does this ~20 times with different
random shuffles ("restarts") and keeps the best. Then it forgets everything and
does it again next round.

**Strengths**
- Dead simple, sub-millisecond, extremely robust.
- Already handles late arrivals/leavers (it just re-runs on whoever's present).
- Optimal *for a single round in isolation*.

**Weakness (the reason we changed):** it's **myopic**. It commits round 1
without any idea that those choices will force repeats in round 7 — and it can
never undo them. It optimizes each round in a vacuum, so the schedule as a whole
drifts away from what's achievable.

---

## v2 — "Receding-Horizon Annealing Planner" (what we run now)

**Family:** simulated-annealing optimizer + model-predictive / receding-horizon
control (plan ahead, commit one step, re-plan as reality changes).
**Code:** `app.algorithm.plan_rounds`; lifecycle in `app.routers.rounds`.
**Design docs:** `docs/design/rotation-replanning.md`.

**Two ideas combined:**

### 1. Simulated annealing (the optimizer)
Instead of seating greedily, it takes a whole multi-round schedule and *polishes*
it: repeatedly swap two people sitting at different tables in the same round, keep
the swap if it reduces total repeats, and *occasionally* accept a worse swap to
escape dead-ends (the "annealing" part, with the acceptance rate cooling over
time). It's **warm-started from greedy**, so it can only ever match or beat
greedy — never do worse. It runs on integer ids + a flat co-seat matrix, so it's
fast even at 1000 people, and it's **time-bounded** (a hard wall-clock cap) so it
can never hang the organizer's console — if it runs out of time it returns the
greedy-quality warm start.

### 2. Plan once, follow, re-plan on change (the strategy)
- When round 1 starts, it plans the **entire remaining schedule** (lookahead is
  the whole point) and caches it.
- It **publishes one round at a time** (attendees never see the future; the
  organizer keeps pacing control).
- For later rounds it **follows the cached plan** — *unless the roster changed*
  (someone arrived late or left), in which case it **re-plans the remainder** for
  whoever's actually present.

On a stable roster this equals the best offline schedule; under churn it re-plans
a few times and keeps most of that quality.

> **Important lesson we learned the hard way:** the naïve version — re-plan every
> round and commit only the first round — is actually **worse than greedy**. The
> optimizer sacrifices early rounds to clean up later ones; if you re-plan and
> throw those later rounds away every round, you keep paying the sacrifices and
> never collect the payoff. "Plan once / follow / re-plan only on change" is what
> makes it work. This is baked into the implementation.

**Safety nets:** greedy is kept as a fallback if the planner ever errors; the
planner is time-bounded; it's deterministic for a seeded RNG (used in tests).

---

## Why we changed (the honest version)

The original v1 verdict compared greedy only to **naive random seating** — a
strawman that proves almost nothing ("we beat throwing darts"). When we instead
benchmarked greedy against a **real optimizer**, greedy was leaving real overlap
on the table: up to ~50% more repeats in the mid-size band, and it *missed
zero-overlap schedules that exist at pilot length*. For a product whose pitch is
"you meet all-new people," that gap is worth closing.

---

## Head-to-head results

Reproduce with: `python backend/scripts/compare_algorithms.py --seed 7`
(pure dry-run, no DB; drives the **real production code** for both engines).

- **stable** = everyone present every round.
- **churn** = ~15% arrive late + ~10% leave early (same schedule fed to both).
- **optimal\*** = best an offline optimizer finds on a stable roster (an
  approximate ceiling; only meaningful in stable rows).
- Numbers are **total repeat-pairings** (lower = better). **improv** = how much
  less overlap v2 produced vs v1.

| Scenario | People | Tables×Seats | Rounds | Cond | v1 Greedy | **v2 Planner** | optimal* | Improvement |
|---|---|---|---|---|---|---|---|---|
| tiny | 12 | 3×4 | 6 | stable | 45 | **42** | 42 | 7% |
| tiny | 12 | 3×4 | 6 | churn | 35 | **35** | — | 0% |
| small | 20 | 5×4 | 8 | stable | 55 | **51** | 50 | 7% |
| small | 20 | 5×4 | 8 | churn | 46 | **43** | — | 7% |
| small-odd | 18 | 5×4 | 7 | stable | 24 | **20** | 23 | 17% |
| small-odd | 18 | 5×4 | 7 | churn | 38 | **36** | — | 5% |
| **pilot** | **40** | **10×4** | **8** | stable | 8 | **1** | 1 | **88%** |
| **pilot** | **40** | **10×4** | **8** | churn | 5 | **0** | — | **100%** |
| pilot-long | 40 | 10×4 | 12 | stable | 60 | **46** | 48 | 23% |
| pilot-long | 40 | 10×4 | 12 | churn | 55 | **49** | — | 11% |
| medium | 50 | 10×5 | 10 | stable | 69 | **63** | 56 | 9% |
| medium | 50 | 10×5 | 10 | churn | 63 | **57** | — | 10% |
| medium-odd | 43 | 9×5 | 9 | stable | 60 | **40** | 42 | 33% |
| medium-odd | 43 | 9×5 | 9 | churn | 50 | **49** | — | 2% |
| large | 80 | 16×5 | 12 | stable | 42 | **26** | 23 | 38% |
| large | 80 | 16×5 | 12 | churn | 35 | **23** | — | 34% |
| huge | 120 | 24×5 | 12 | stable | 3 | **0** | 0 | 100% |
| huge | 120 | 24×5 | 12 | churn | 8 | **0** | — | 100% |
| very-huge | 200 | 40×5 | 14 | stable | 0 | **0** | 0 | 0% |
| very-huge | 200 | 40×5 | 14 | churn | 2 | **0** | — | 100% |
| xl | 300 | 60×5 | 14 | stable | 0 | **0** | 0 | 0% |
| xl | 300 | 60×5 | 14 | churn | 0 | **0** | — | 0% |
| xxl | 500 | 100×5 | 16 | stable | 0 | **0** | 0 | 0% |
| xxl | 500 | 100×5 | 16 | churn | 0 | **0** | — | 0% |
| mega | 800 | 134×6 | 16 | stable | 1 | **0** | 0 | 100% |
| mega | 800 | 134×6 | 16 | churn | 0 | **0** | — | 0% |
| giga | 1000 | 167×6 | 18 | stable | 0 | **0** | 0 | 0% |
| giga | 1000 | 167×6 | 18 | churn | 3 | **0** | — | 100% |

*(seed 7; the planner uses a time budget, so exact numbers vary slightly run to
run, but the ranking is stable.)*

### How to read these results

- **v2 ≥ v1 in every single row.** The planner never loses to greedy.
- **The big wins are in the mid-size band (40–80 people)** — pilot 88%, large
  38%, medium-odd 33%. This is exactly where real events live: enough rounds that
  greedy starts repeating, but the room still has novelty to extract. **At pilot
  length the planner drives overlap to zero.**
- **Tiny saturated rooms** (12–20 people running many rounds) are overlap-*bound*
  — the room mathematically runs out of strangers, so nothing helps much (0–17%).
  v2 still never does worse.
- **Very large rooms** (200+ people) have so much novelty headroom that even
  myopic greedy is already near-zero, so v2's gain is small there (it just cleans
  up the last stray repeats — e.g. giga-churn 3→0). The value is concentrated in
  the middle, not the extremes.
- **Churn rows prove robustness:** v2 wins (or ties) in every late-arrival /
  early-leaver scenario, because it re-plans from whoever's actually present.

### Performance & scale (also from the sweep)

The planner is time-bounded and stayed practical at every size — **1000 people
planned in single-digit-to-low-teens seconds**, and the **pilot scale (40–70) is
sub-second**. At the live event only the *first* round of a stable stretch pays
the planning cost; subsequent rounds just **follow the cached plan** (a fast DB
read). The organizer presses a button once per ~5-minute round, and attendees
never wait on this path at all (they get updates via Realtime).

---

## When does each shine? (quick reference)

| Situation | Winner | Why |
|---|---|---|
| Mid-size event, several rounds (our pilot) | **v2 by a lot** | Greedy's myopia costs the most here; planner reaches ~optimal |
| Tiny room, many rounds | tie | Overlap is mathematically forced; nothing helps |
| Huge room, few rounds | ~tie | So much novelty headroom greedy is already near-perfect |
| People arriving late / leaving early | **v2** | Re-plans from the live roster; greedy stays myopic |
| Need a guaranteed instant answer (planner failed/timed out) | **v1 fallback** | Greedy is the safety net, always available |

---

## Glossary

- **Repeat pairing** — two people seated at the same table in more than one
  round; the second (and later) time counts as a repeat.
- **Greedy** — make the locally-best choice now, ignore the future.
- **Simulated annealing (SA)** — an optimization method that improves a solution
  by random tweaks, sometimes accepting worse ones early to avoid getting stuck,
  cooling toward the best found.
- **Lookahead / receding horizon** — plan several steps ahead, commit one, then
  re-plan as new information (the roster) arrives.
- **Social Golfer Problem** — the academic name for "schedule groups over rounds
  minimizing repeated pairings."
- **Horizon (`target_rounds`)** — how many rounds the planner aims for; the
  organizer's intended count, or the room's novelty ceiling if unset.

---

## Anything else worth knowing

- **Migration required:** the v2 plan cache needs `supabase/migrations/003_replanning.sql`
  (`round_plans` table + `events.target_rounds`). Verified applied on the shared project.
- **Privacy:** `round_plans` (which holds *future* seatings) is service-role only —
  not client-readable and not in the Realtime publication, so attendees can't peek
  at upcoming rounds. Confirmed with an anon-key read returning nothing.
- **The greedy engine isn't deleted** — it's the deliberate fallback. "Reliability
  over cleverness": if the planner ever misbehaves at the live event, seating still
  happens.
- **Validation tooling:** `compare_algorithms.py` (this comparison) and
  `validate_rotation.py` (single-config deep dive with live DB latency).
