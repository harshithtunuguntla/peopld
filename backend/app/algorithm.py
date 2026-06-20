"""Rotation algorithm — Step 4.

Seats arrived attendees so people meet as many NEW faces as possible.
Pure novelty: minimize repeat pairings, nothing else. Spec and decisions:
docs/design/rotation-algorithm.md (implementation must follow it).
"""

import hashlib
import random
import time
from dataclasses import dataclass
from itertools import combinations
from math import exp

MIN_TABLE_SIZE = 3  # default minimum when the organizer sets none (pack toward 3)
HARD_FLOOR = 2  # smallest table an organizer may ask for — a table of 1 isn't networking
DEFAULT_RESTARTS = 20
DEFAULT_TIME_BUDGET_S = 3.0  # hard wall-clock cap on the planner — never hang the console

# Intent-aware seating (Phase 3b). The objective becomes
#   repeats − λ·(weight of newly-satisfied "want to meet" picks)
# folded into the SAME delta loops as novelty, so honoring picks costs nothing
# asymptotically. These weights were validated offline across 15 scenarios
# (n=30→160) in scripts/simulate_intent.py — see docs/design/phase3-intent-findings.md.
# A pair is MUTUAL when both people picked each other (weighted heavily so it is
# effectively guaranteed when feasible); a one-way pick is a softer bonus.
# With no intents the reward is identically zero, so seating is byte-for-byte the
# pure-novelty result (deterministic for a seeded rng).
INTENT_LAMBDA = 3
INTENT_W_MUTUAL = 4
INTENT_W_ONEWAY = 1

# frozenset({attendee_id_a, attendee_id_b}) -> number of rounds they shared a table
PairCounts = dict[frozenset, int]


class RotationError(ValueError):
    """No valid seating exists for this pool + event config. Message is organizer-facing."""


@dataclass
class Rotation:
    tables: dict[str, int]  # attendee_id -> table_number (1-based, low numbers first)
    table_sizes: list[int]
    repeat_pairings: int  # seated pairs that have already met in a previous round


def draft_snapshot_hash(
    arrived_ids: list[str],
    num_tables: int,
    seats_per_table: int,
    min_size: int | None = None,
    max_size: int | None = None,
) -> str:
    """Fingerprint of everything a draft depends on (arrived set + table config).

    Publish compares this against a fresh snapshot — any change means the
    preview no longer matches reality and must be regenerated. Table-size bounds
    are part of the config, so changing them invalidates a pending draft too.
    """
    material = (
        f"{num_tables}:{seats_per_table}:{min_size or ''}:{max_size or ''}:"
        + ",".join(sorted(arrived_ids))
    )
    return hashlib.sha256(material.encode()).hexdigest()


def table_floor(min_size: int | None = None) -> int:
    """The minimum table size the algorithm packs toward. Organizer-set `min_size`
    (clamped to HARD_FLOOR so it's never below 2), else the default of 3."""
    return max(HARD_FLOOR, min_size or MIN_TABLE_SIZE)


def table_ceiling(
    seats_per_table: int, min_size: int | None = None, max_size: int | None = None
) -> int:
    """The largest a table may grow to. An explicit `max_size` wins; otherwise the
    event's seats_per_table is the comfortable ceiling — but never below floor + 1,
    so the natural "sprinkle one leftover" (a min+1 table) never trips a false
    over-capacity warning."""
    floor = table_floor(min_size)
    if max_size:
        return max_size
    return max(seats_per_table, floor + 1)


def table_capacity(
    num_tables: int, seats_per_table: int,
    min_size: int | None = None, max_size: int | None = None,
) -> int:
    """Comfortable seats in the room = tables x ceiling. A pool above this still
    seats (tables overfill past the ceiling), but the caller should warn about it."""
    return num_tables * table_ceiling(seats_per_table, min_size, max_size)


def plan_table_sizes(
    pool_size: int,
    seats_per_table: int,
    num_tables: int,
    *,
    min_size: int | None = None,
    max_size: int | None = None,
) -> list[int]:
    """How many tables, of which sizes. MIN-DRIVEN: make as many tables as possible
    at the minimum size, then hand the leftover people out one per table (so a few
    become min+1), growing past min+1 toward the ceiling only when the room runs
    out of tables. This is exactly "fill every table to the minimum, then split the
    remaining people across existing tables".

    Rules honored:
    - never a table below the floor (organizer min, clamped to 2);
    - leftovers join existing tables rather than forming an undersized one;
    - nobody is ever left unseated — an over-capacity room OVERFILLS past the
      ceiling instead of erroring, and the caller surfaces that as a warning so the
      organizer can add a table or accept the squeeze.

    Decides bucket SIZES only; which people share a table is the optimizer's job
    (novelty + mutuals + honored picks), which this does not touch.
    """
    if num_tables < 1:
        raise RotationError("The event needs at least one table.")
    floor = table_floor(min_size)
    ceil_ = table_ceiling(seats_per_table, min_size, max_size)
    if ceil_ < floor:
        raise RotationError(
            f"Max per table ({ceil_}) can't be smaller than the minimum ({floor}). "
            "Adjust the table sizes in the event settings."
        )
    if pool_size < floor:
        raise RotationError(
            f"Need at least {floor} arrived attendees to start a round "
            f"({pool_size} currently)"
        )

    # As many tables as possible while each keeps at least `floor` people. When the
    # physical table count binds, tables grow above the floor (and, for an
    # over-capacity room, past the ceiling — an intentional overfill, not an error).
    table_count = max(1, min(num_tables, pool_size // floor))
    base, extra = divmod(pool_size, table_count)
    return [base + 1] * extra + [base] * (table_count - extra)


def generate_rotation(
    arrived_ids: list[str],
    pair_counts: PairCounts,
    num_tables: int,
    seats_per_table: int,
    rng: random.Random | None = None,
    restarts: int = DEFAULT_RESTARTS,
    min_size: int | None = None,
    max_size: int | None = None,
) -> Rotation:
    """Greedy fill with random restarts; keeps the lowest-repeat arrangement.

    Deterministic for a seeded rng. At pilot scale (<=100 people) the whole
    thing is milliseconds. Raises RotationError when no valid plan exists.
    """
    rng = rng or random.Random()
    sizes = plan_table_sizes(len(arrived_ids), seats_per_table, num_tables,
                             min_size=min_size, max_size=max_size)

    best_tables: dict[str, int] = {}
    best_score: int | None = None
    for _ in range(max(1, restarts)):
        tables, score = _greedy_fill(arrived_ids, pair_counts, sizes, rng)
        if best_score is None or score < best_score:
            best_tables, best_score = tables, score
        if best_score == 0:
            break  # can't beat zero repeats

    return Rotation(
        tables=best_tables,
        table_sizes=sizes,
        repeat_pairings=_count_repeat_pairs(best_tables, pair_counts),
    )


def _greedy_fill(
    arrived_ids: list[str],
    pair_counts: PairCounts,
    sizes: list[int],
    rng: random.Random,
) -> tuple[dict[str, int], int]:
    """One greedy pass: seat each person where they add the fewest repeats."""
    order = list(arrived_ids)
    rng.shuffle(order)
    members: list[list[str]] = [[] for _ in sizes]

    for person in order:
        best_cost: int | None = None
        candidates: list[int] = []
        for idx, group in enumerate(members):
            if len(group) >= sizes[idx]:
                continue
            cost = sum(pair_counts.get(frozenset((person, other)), 0) for other in group)
            if best_cost is None or cost < best_cost:
                best_cost, candidates = cost, [idx]
            elif cost == best_cost:
                candidates.append(idx)
        members[rng.choice(candidates)].append(person)

    tables = {
        person: table_idx + 1
        for table_idx, group in enumerate(members)
        for person in group
    }
    # Weighted score: pairing people who met twice is worse than once.
    score = 0
    for group in members:
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                score += pair_counts.get(frozenset((group[i], group[j])), 0)
    return tables, score


def _count_repeat_pairs(tables: dict[str, int], pair_counts: PairCounts) -> int:
    """Unweighted count of seated pairs that have met before (organizer-facing)."""
    groups: dict[int, list[str]] = {}
    for person, table_number in tables.items():
        groups.setdefault(table_number, []).append(person)
    repeats = 0
    for group in groups.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if pair_counts.get(frozenset((group[i], group[j])), 0) > 0:
                    repeats += 1
    return repeats


# ──────────────────────────────────────────────────────────────────────────
# Re-planning optimizer (v2) — see docs/design/rotation-replanning.md
#
# Plans a MULTI-round schedule that minimizes TOTAL repeat-pairings over a
# horizon, not just the next round. Greedy (above) stays as the per-round
# fallback. The "plan once / follow / re-plan on roster change" orchestration
# lives in the endpoint layer (it needs the cached plan); this module is the
# pure engine: given who is here and the history, return the best plan it can.
#
# Internals use integer ids + a flat co-seat matrix so it stays fast at 1000
# people. It is warm-started from greedy (so it can never be worse than greedy),
# time-bounded, and deterministic for a seeded RNG.
# ──────────────────────────────────────────────────────────────────────────


@dataclass
class RotationPlan:
    rounds: list[dict[str, int]]  # rounds[0] is the next round to play; each: attendee_id -> table_number
    table_sizes: list[int]
    horizon: int
    total_repeat_pairings: int  # planned repeat-pairings across the horizon (future overlap)
    intent_pairs_satisfied: int = 0  # requested "want to meet" pairs seated together over the horizon
    intent_pairs_requested: int = 0  # distinct requested pairs among the seated pool (the denominator)


def _build_want_matrix(
    intents: set[tuple[str, str]] | None, index: dict[str, int], n: int
) -> tuple[list[int], set[frozenset]]:
    """Flat n*n symmetric like-weight matrix + the set of requested pairs.

    Each directed pick (a wants b) contributes a weight on the {a,b} cell:
    INTENT_W_MUTUAL when both directions exist, else INTENT_W_ONEWAY. Picks that
    touch someone outside the seated pool (a no-show, or a never-seated guest)
    are dropped — they leave the seating problem entirely. The matrix is all
    zeros (and `requested` empty) when there are no intents, which makes the
    objective collapse to pure novelty.
    """
    want = [0] * (n * n)
    requested: set[frozenset] = set()
    if not intents:
        return want, requested
    directed = {(a, b) for (a, b) in intents if a in index and b in index}
    for a, b in directed:
        pair = frozenset((a, b))
        if pair in requested:
            continue
        requested.add(pair)
        ia, ib = index[a], index[b]
        w = INTENT_W_MUTUAL if (b, a) in directed else INTENT_W_ONEWAY
        want[ia * n + ib] = w
        want[ib * n + ia] = w
    return want, requested


def plan_rounds(
    arrived_ids: list[str],
    pair_counts: PairCounts,
    num_tables: int,
    seats_per_table: int,
    horizon: int,
    rng: random.Random | None = None,
    warm_restarts: int = DEFAULT_RESTARTS,
    sa_iters: int | None = None,
    time_budget_s: float = DEFAULT_TIME_BUDGET_S,
    intents: set[tuple[str, str]] | None = None,
    min_size: int | None = None,
    max_size: int | None = None,
) -> RotationPlan:
    """Plan up to `horizon` rounds for the arrived pool, minimizing future overlap.

    `pair_counts` is the history from already-published rounds (who has already
    met). `intents` are directed "want to meet" picks (liker_id, liked_id); the
    planner honors them (mutual ≫ one-way) without sacrificing novelty beyond the
    validated cost — see docs/design/phase3-intent-findings.md. The returned
    plan's first round is the one to play next. Raises RotationError when no valid
    seating exists (same guard as greedy).
    """
    rng = rng or random.Random()
    if horizon < 1:
        raise RotationError("Planning horizon must be at least 1 round.")
    sizes = plan_table_sizes(len(arrived_ids), seats_per_table, num_tables,
                             min_size=min_size, max_size=max_size)

    n = len(arrived_ids)
    index = {aid: i for i, aid in enumerate(arrived_ids)}

    # Seed the co-seat matrix with history (only pairs within the present pool).
    base = [0] * (n * n)
    for pair, count in pair_counts.items():
        if count <= 0:
            continue
        a, b = tuple(pair)
        ia, ib = index.get(a), index.get(b)
        if ia is not None and ib is not None:
            base[ia * n + ib] = count
            base[ib * n + ia] = count

    want, requested = _build_want_matrix(intents, index, n)
    lam = INTENT_LAMBDA if requested else 0

    present = list(range(n))
    deadline = time.perf_counter() + max(0.05, time_budget_s)

    # 1) Greedy warm start over the horizon — guarantees the plan is never worse
    #    than greedy, and gives SA a strong starting point.
    sched = _greedy_plan_int(present, base, n, sizes, want, lam, horizon, rng,
                             warm_restarts, deadline)

    # 2) Anneal: polish the whole plan toward the minimum-overlap schedule.
    sched, cost = _anneal_plan_int(present, base, n, sizes, want, lam, sched, rng,
                                   sa_iters, deadline)

    rounds = [
        {arrived_ids[member]: t + 1 for t, table in enumerate(rnd) for member in table}
        for rnd in sched
    ]
    satisfied = _count_satisfied(sched, base, requested, index, n) if requested else 0
    return RotationPlan(rounds=rounds, table_sizes=sizes, horizon=horizon,
                        total_repeat_pairings=cost,
                        intent_pairs_satisfied=satisfied,
                        intent_pairs_requested=len(requested))


def _count_satisfied(sched: list[list[list[int]]], base: list[int],
                     requested: set[frozenset], index: dict[str, int], n: int) -> int:
    """How many requested pairs have met — already in history (`base`) OR seated
    together at least once in the plan. A pick whose pair met in an already-played
    round is satisfied: the planner spends no novelty re-seating them (the reward
    only fires on the first co-seating), and the meeting still counts here."""
    met: set[int] = set()
    for rnd in sched:
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                met.add(a * n + b)
                met.add(b * n + a)
    count = 0
    for pair in requested:
        a, b = tuple(pair)
        cell = index[a] * n + index[b]
        if cell in met or base[cell] >= 1:
            count += 1
    return count


def _seat_greedy_int(present: list[int], cnt: list[int], n: int, sizes: list[int],
                     want: list[int], lam: int,
                     rng: random.Random, restarts: int) -> list[list[int]]:
    """One round, greedy-with-restarts in integer space (mirrors _greedy_fill).

    Minimizes repeats − λ·(weight of newly-satisfied picks). A pick is "newly
    satisfied" only when the pair has not yet shared a table (cnt == 0). With
    `lam == 0` / all-zero `want` this is identical to pure-novelty greedy.
    """
    best: list[list[int]] | None = None
    best_obj: int | None = None
    for _ in range(max(1, restarts)):
        order = list(present)
        rng.shuffle(order)
        members: list[list[int]] = [[] for _ in sizes]
        for p in order:
            pb = p * n
            low: int | None = None
            cands: list[int] = []
            for idx, group in enumerate(members):
                if len(group) >= sizes[idx]:
                    continue
                rep = 0
                rew = 0
                for m in group:
                    c = cnt[pb + m]
                    rep += c
                    if c == 0 and want[pb + m]:
                        rew += want[pb + m]
                cost = rep - lam * rew
                if low is None or cost < low:
                    low, cands = cost, [idx]
                elif cost == low:
                    cands.append(idx)
            members[rng.choice(cands)].append(p)
        obj = 0
        for group in members:
            for i in range(len(group)):
                gi = group[i] * n
                for j in range(i + 1, len(group)):
                    m = group[j]
                    c = cnt[gi + m]
                    obj += c
                    if c == 0 and want[gi + m]:
                        obj -= lam * want[gi + m]
        if best_obj is None or obj < best_obj:
            best_obj, best = obj, members
        if best_obj == 0:
            break
    return best or [[] for _ in sizes]


def _greedy_plan_int(present: list[int], base: list[int], n: int, sizes: list[int],
                     want: list[int], lam: int, horizon: int, rng: random.Random,
                     restarts: int, deadline: float) -> list[list[list[int]]]:
    """Greedy plan for the whole horizon (warm start), counting history `base`."""
    cnt = base[:]
    plan: list[list[list[int]]] = []
    for _ in range(horizon):
        r = restarts if time.perf_counter() < deadline else 1
        rnd = _seat_greedy_int(present, cnt, n, sizes, want, lam, rng, r)
        plan.append(rnd)
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                cnt[a * n + b] += 1
                cnt[b * n + a] += 1
    return plan


def _anneal_plan_int(present: list[int], base: list[int], n: int, sizes: list[int],
                     want: list[int], lam: int,
                     warm: list[list[list[int]]], rng: random.Random,
                     iters: int | None, deadline: float) -> tuple[list[list[list[int]]], int]:
    """Simulated annealing over the warm-start plan; returns (best_plan, future_repeats).

    Swaps two people at different tables within a round (sizes preserved).
    Minimizes the objective repeats − λ·(satisfied-pick weight); the returned
    cost is the plan's pure future repeat-pairings (novelty), independent of
    intents. Counts history `base` as fixed; only planned rounds are mutated.
    Stops at the iteration cap or the wall-clock deadline, whichever comes first.
    """
    horizon = len(warm)
    sched = [[tbl[:] for tbl in rnd] for rnd in warm]

    cnt = base[:]
    for rnd in sched:
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                cnt[a * n + b] += 1
                cnt[b * n + a] += 1

    def future_repeats() -> int:
        # repeat-pairings introduced by the plan = total over present pairs minus
        # the history's own repeats (constant); we report the plan's contribution.
        plan_rep = 0
        for ii in range(len(present)):
            pb = present[ii] * n
            for jj in range(ii + 1, len(present)):
                v = cnt[pb + present[jj]]
                if v > 1:
                    plan_rep += v - 1
        hist_rep = 0
        for ii in range(len(present)):
            pb = present[ii] * n
            for jj in range(ii + 1, len(present)):
                v = base[pb + present[jj]]
                if v > 1:
                    hist_rep += v - 1
        return plan_rep - hist_rep

    # Current objective = repeats − λ·(weight of satisfied picks). The history
    # offset is constant across swaps, so it does not affect the argmin; what
    # matters is that the reward term tracks the same value the delta loop moves.
    cur = 0
    for ii in range(len(present)):
        pb = present[ii] * n
        for jj in range(ii + 1, len(present)):
            v = cnt[pb + present[jj]]
            if v > 1:
                cur += v - 1
            if v >= 1 and want[pb + present[jj]]:
                cur -= lam * want[pb + present[jj]]

    if iters is None:
        iters = min(200_000, max(25_000, len(present) * horizon * 120))
    t0, t1 = 2.0, 0.02
    best_cost = cur
    best = [[tbl[:] for tbl in rnd] for rnd in sched]
    rrandom, rrange, rsample = rng.random, rng.randrange, rng.sample

    for it in range(iters):
        if (it & 0x3FF) == 0 and time.perf_counter() >= deadline:
            break
        temp = t0 * (t1 / t0) ** (it / iters)
        rnd = sched[rrange(horizon)]
        if len(rnd) < 2:
            continue
        ti, tj = rsample(range(len(rnd)), 2)
        a_tbl, b_tbl = rnd[ti], rnd[tj]
        ia, ib = rrange(len(a_tbl)), rrange(len(b_tbl))
        x, y = a_tbl[ia], b_tbl[ib]
        xb, yb = x * n, y * n

        # Objective delta = repeat delta − λ·(reward delta). A pick's reward flips
        # only when its pair crosses the 0↔1 co-seating boundary.
        d_rep = 0
        d_rew = 0
        for k in range(len(a_tbl)):
            if k == ia:
                continue
            m = a_tbl[k]
            cxm, cym = cnt[xb + m], cnt[yb + m]
            if cxm >= 2:
                d_rep -= 1
            if cxm == 1 and want[xb + m]:
                d_rew -= want[xb + m]
            if cym >= 1:
                d_rep += 1
            if cym == 0 and want[yb + m]:
                d_rew += want[yb + m]
        for k in range(len(b_tbl)):
            if k == ib:
                continue
            m = b_tbl[k]
            cxm, cym = cnt[xb + m], cnt[yb + m]
            if cym >= 2:
                d_rep -= 1
            if cym == 1 and want[yb + m]:
                d_rew -= want[yb + m]
            if cxm >= 1:
                d_rep += 1
            if cxm == 0 and want[xb + m]:
                d_rew += want[xb + m]

        delta = d_rep - lam * d_rew
        if delta <= 0 or rrandom() < exp(-delta / (temp if temp > 1e-9 else 1e-9)):
            a_tbl[ia], b_tbl[ib] = y, x
            for k in range(len(a_tbl)):
                if k == ia:
                    continue
                m = a_tbl[k]
                cnt[xb + m] -= 1; cnt[m * n + x] -= 1
                cnt[yb + m] += 1; cnt[m * n + y] += 1
            for k in range(len(b_tbl)):
                if k == ib:
                    continue
                m = b_tbl[k]
                cnt[xb + m] += 1; cnt[m * n + x] += 1
                cnt[yb + m] -= 1; cnt[m * n + y] -= 1
            cur += delta
            if cur < best_cost:
                best_cost = cur
                best = [[tbl[:] for tbl in rr] for rr in sched]

    # Recompute the plan's own (future) repeat contribution on the best schedule.
    cnt = base[:]
    for rnd in best:
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                cnt[a * n + b] += 1
                cnt[b * n + a] += 1
    return best, future_repeats()
