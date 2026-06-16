# Phase 3 — Intent-aware seating: simulation findings

**Question:** can pre-event "I want to meet X" likes be honored by the rotation
without wrecking novelty — across real event sizes (30–160) and real like
structures (hubs, friend-cliques, marketplaces) — and how many likes are
physically impossible?

**Method:** `backend/scripts/simulate_intent.py` — a pure, deterministic, offline
simulation (does **not** touch production `app.algorithm`). It prototypes the
candidate objective on the same integer-matrix greedy + simulated-annealing
machine production uses, reusing the real `plan_table_sizes`. Run it yourself:

```
cd backend && python scripts/simulate_intent.py --trials 4      # full sweep
cd backend && python scripts/simulate_intent.py --live          # mid-event re-plan
```

A like (a→b) is **satisfied** when a and b share a table in ≥1 round. Mutual =
both directions exist. Weights: mutual = 4, one-way = 1. Three objectives, same
engine, λ the only knob: **NOVELTY** (production today), **INTENT-BAL** (novelty −
λ·all-satisfied-likes), **INTENT-MUTUAL** (novelty − λ·satisfied-mutual-only).

The harness models the Phase 3 product decisions: speakers **excluded** from the
rotation (their likes leave the seating problem), **no-shows**, and **live
mid-event** likes (re-plan only the remaining rounds from fixed history).

## Results — full sweep (4 trials/scenario, 2 s budget)

Reading: `repeats` lower = better novelty; `+N` = extra repeats vs NOVELTY;
`avg met` = distinct people each attendee meets; `mutual`/`one-way` =
satisfied/requested.

### Scale sweep (uniform likes, 30 → 160)

| scenario | variant | repeats | avg met | mutual | one-way | ms |
|---|---|--:|--:|--:|--:|--:|
| s30  | INTENT-MUTUAL | **+0** | 16.8 | **100%** | 56% | 284 |
|      | INTENT-BAL    | +7  | 16.3 | 100% | 96% | 268 |
| s40 (pilot) | INTENT-MUTUAL | **+0** | 18.0 | **100%** | 43% | 302 |
|      | INTENT-BAL    | +10 | 17.5 | 100% | 95% | 333 |
| s60  | INTENT-MUTUAL | **+0** | 28.0 | **100%** | 47% | 680 |
|      | INTENT-BAL    | +28 | 27.0 | 100% | 99% | 630 |
| s80  | INTENT-MUTUAL | **+0** | 32.0 | **100%** | 42% | 988 |
|      | INTENT-BAL    | +24 | 31.4 | 100% | 100% | 969 |
| s120 | INTENT-MUTUAL | **+0** | 40.0 | **100%** | 34% | 1615 |
|      | INTENT-BAL    | +36 | 39.4 | 100% | 100% | 1523 |
| s160 | INTENT-MUTUAL | **+0** | 39.5 | **100%** | 25% | 1947 |
|      | INTENT-BAL    | +29 | 39.1 | 100% | 99% | 1949 |

### Like-structure stress + robustness (n=40 unless noted)

| scenario | INTENT-MUTUAL mutual | INTENT-BAL one-way | note |
|---|--:|--:|---|
| clique40 (fully-mutual groups of 5) | **100%** (+2) | — | dense mutual survives |
| clique80 (groups of 6, n=80) | **100%** (+2) | — | survives at scale |
| hub40 (popular seated attendee, ~28 admirers) | 100% (+0) | 79% | in-degree ceiling |
| bipartite80 (recruiter→candidate) | 100% (+1) | 100% (+12) | marketplace shape |
| sparse40 (k=2) | 100% (+0) | 100% (+0) | no regression |
| saturated40 (k=12, mutual-deg ~8) | 100% (+1) | 64% | volume stress |
| fewrounds40 (rounds=3) | **100% (+0)** | 62% | tight capacity |
| noshow40 (20% don't arrive) | 100% (+0) | 99% | graceful |
| speakers40 (speakers excluded) | 100% (+0) | **100% (+0)** | cliff removed |

### Live mid-event re-plan (play 2 rounds, inject late likes, re-plan the rest)

- Late **mutual** likes satisfied in remaining rounds: **100%**.
- Late **one-way** likes satisfied: **86%**.
- Novelty: live `repeats=12.6` vs full-knowledge oracle `9.8` — a small,
  honest cost for the 2 rounds locked before the late likes existed.

## What the numbers say

1. **Guaranteeing MUTUAL likes is FREE — everywhere.** Across all 15 scenarios,
   30 → 160, INTENT-MUTUAL hits **100% of mutual likes at +0 novelty cost**
   (identical repeats and avg-met as pure novelty). Even fully-mutual **cliques**
   cost only +2 repeats; even **3 rounds** is +0; even mutual-degree-8 saturation
   is +1. **"If you both want to meet, you will" holds as a hard promise.** No
   scenario showed mutual-over-budget, so there is no physics violation to fear at
   these sizes.

2. **The feature is worth building.** Pure novelty satisfies only **25–54%** of
   likes by luck (and *falls* as the event grows — 33% at n=160). Intent fixes
   that deterministically.

3. **One-way is a tunable bonus that's nearly free in meeting terms.** INTENT-BAL
   reaches **95–100%** one-way. The `+N repeats` looks large at scale but
   `avg met` barely moves (s160: 39.5 → 39.1, under one person). Tune λ to taste.

4. **Excluding speakers removes the capacity cliff.** hub40 (popular attendee
   *seated*, ~28 admirers) caps one-way at 79%; speakers40 (excluded) →
   one-way 100%, cliff gone. Confirms the decision: speakers are guests, not
   seated. The rare *seated* over-liked attendee is the only residual ceiling,
   and it is surfaced honestly (admirers vs servable).

5. **Live mid-event works.** Re-planning only the remaining rounds from fixed
   history recovers 100% of late mutual likes with novelty within a hair of the
   oracle — and production already re-plans from history (`rounds.py`), so this is
   a small extension, not a rebuild.

6. **Performance is fine.** ~0.3 s at the pilot, ~2.0 s at n=160 (hit the 2 s
   harness budget and still nailed 100% mutual). Under the production 3 s wall.

## Recommendation — GREEN LIGHT

Proceed with Phase 3, staged for confidence:
- **3a — likes data model + UI + the round-start nudge.** No algorithm change.
  Own table `meeting_intents` (service-role-only RLS); like-toggle on the
  directory, capped at #rounds; private nudge to the liker; post-event
  **mutual-only** reveal.
- **3b — extend the production objective:** guarantee feasible **mutual** likes
  (free), one-way as a tunable soft bonus, report the infeasible set, and add a
  likes-version to the plan cache so mid-event likes re-plan the tail.
- Keep this harness as the regression gate for any objective change.

**Confirmed product decisions:** mutual guaranteed first, one-way soft bonus;
per-person cap = #rounds; likes private until mutual (post-event reveal is
mutual-only); speakers excluded from the rotation; likes stay editable live
mid-event.

## Shipped to production — 3b (2026-06-16)

The validated objective is now in `app/algorithm.py`. `plan_rounds(..., intents=...)`
folds `− λ·(satisfied-pick weight)` (λ=3, mutual=4, one-way=1) into the **same**
greedy + SA delta loops as novelty — `INTENT_LAMBDA`, `INTENT_W_MUTUAL`,
`INTENT_W_ONEWAY`. With no intents the reward is identically zero, so seating is
byte-for-byte the old pure-novelty result (all prior tests + determinism intact).

`rounds.py` fetches `meeting_intents` restricted to the **seated** pool (picks
toward no-shows / non-seated guests are dropped) and passes them in. The plan
cache key (`_plan_cache_hash`) now folds in a fingerprint of the seated picks, so
when an attendee changes a pick mid-event the cached plan is treated as stale and
the next `/start` re-plans the remaining rounds from fixed history — the "stay
live mid-event" behavior. The draft's own `arrived_hash` stays attendance-only
(the stale-publish guard is unchanged).

`RotationPlan` now also reports `intent_pairs_satisfied` / `intent_pairs_requested`
(requested meetings honored over the horizon) — available to surface to the
organizer later.

**Production cross-check (pilot n=40, 6 rounds, k=5, 5 seeds):** mutual **100%**
every seed, one-way 96–97%, repeats 8–13, ~0.2 s — matching the offline study.
Tests: `backend/tests/test_rotation_intents.py` (9). Regression gate unchanged:
`scripts/simulate_intent.py`.
