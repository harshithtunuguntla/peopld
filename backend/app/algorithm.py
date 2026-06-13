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

MIN_TABLE_SIZE = 3
DEFAULT_RESTARTS = 20
DEFAULT_TIME_BUDGET_S = 3.0  # hard wall-clock cap on the planner — never hang the console

# frozenset({attendee_id_a, attendee_id_b}) -> number of rounds they shared a table
PairCounts = dict[frozenset, int]


class RotationError(ValueError):
    """No valid seating exists for this pool + event config. Message is organizer-facing."""


@dataclass
class Rotation:
    tables: dict[str, int]  # attendee_id -> table_number (1-based, low numbers first)
    table_sizes: list[int]
    repeat_pairings: int  # seated pairs that have already met in a previous round


def draft_snapshot_hash(arrived_ids: list[str], num_tables: int, seats_per_table: int) -> str:
    """Fingerprint of everything a draft depends on (arrived set + table config).

    Publish compares this against a fresh snapshot — any change means the
    preview no longer matches reality and must be regenerated.
    """
    material = f"{num_tables}:{seats_per_table}:" + ",".join(sorted(arrived_ids))
    return hashlib.sha256(material.encode()).hexdigest()


def plan_table_sizes(pool_size: int, seats_per_table: int, num_tables: int) -> list[int]:
    """Decide how many tables of which sizes, per the design rules.

    Target = seats_per_table; min 3, max seats_per_table + 1; never 2.
    Remainder of 1 -> one bigger table; remainder of 2+ -> extra smaller
    tables (prefer 3s over 5s). Fewest tables, sizes descending.
    """
    if seats_per_table < MIN_TABLE_SIZE:
        raise RotationError(f"seats_per_table must be at least {MIN_TABLE_SIZE}")
    if pool_size < MIN_TABLE_SIZE:
        raise RotationError(
            f"Need at least {MIN_TABLE_SIZE} arrived attendees to start a round "
            f"({pool_size} currently)"
        )
    max_size = seats_per_table + 1
    capacity = num_tables * max_size
    if pool_size > capacity:
        raise RotationError(
            f"{pool_size} arrived attendees exceed venue capacity "
            f"({num_tables} tables x {max_size} max seats = {capacity}). "
            "Increase tables or seats per table in the event settings."
        )

    full_tables, remainder = divmod(pool_size, seats_per_table)
    table_count = full_tables if remainder <= 1 else full_tables + 1
    table_count = max(1, min(table_count, num_tables))
    # Splitting further would create tables under the minimum — merge instead.
    while table_count > 1 and pool_size // table_count < MIN_TABLE_SIZE:
        table_count -= 1

    base, extra = divmod(pool_size, table_count)
    sizes = [base + 1] * extra + [base] * (table_count - extra)
    if sizes[0] > max_size:
        raise RotationError(
            f"No valid table split for {pool_size} attendees with tables of "
            f"{seats_per_table} (min {MIN_TABLE_SIZE}, max {max_size} per table). "
            "Adjust seats per table in the event settings."
        )
    return sizes


def generate_rotation(
    arrived_ids: list[str],
    pair_counts: PairCounts,
    num_tables: int,
    seats_per_table: int,
    rng: random.Random | None = None,
    restarts: int = DEFAULT_RESTARTS,
) -> Rotation:
    """Greedy fill with random restarts; keeps the lowest-repeat arrangement.

    Deterministic for a seeded rng. At pilot scale (<=100 people) the whole
    thing is milliseconds. Raises RotationError when no valid plan exists.
    """
    rng = rng or random.Random()
    sizes = plan_table_sizes(len(arrived_ids), seats_per_table, num_tables)

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
) -> RotationPlan:
    """Plan up to `horizon` rounds for the arrived pool, minimizing future overlap.

    `pair_counts` is the history from already-published rounds (who has already
    met). The returned plan's first round is the one to play next. Raises
    RotationError when no valid seating exists (same guard as greedy).
    """
    rng = rng or random.Random()
    if horizon < 1:
        raise RotationError("Planning horizon must be at least 1 round.")
    sizes = plan_table_sizes(len(arrived_ids), seats_per_table, num_tables)

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

    present = list(range(n))
    deadline = time.perf_counter() + max(0.05, time_budget_s)

    # 1) Greedy warm start over the horizon — guarantees the plan is never worse
    #    than greedy, and gives SA a strong starting point.
    sched = _greedy_plan_int(present, base, n, sizes, horizon, rng, warm_restarts, deadline)

    # 2) Anneal: polish the whole plan toward the minimum-overlap schedule.
    sched, cost = _anneal_plan_int(present, base, n, sizes, sched, rng, sa_iters, deadline)

    rounds = [
        {arrived_ids[member]: t + 1 for t, table in enumerate(rnd) for member in table}
        for rnd in sched
    ]
    return RotationPlan(rounds=rounds, table_sizes=sizes, horizon=horizon,
                        total_repeat_pairings=cost)


def _seat_greedy_int(present: list[int], cnt: list[int], n: int, sizes: list[int],
                     rng: random.Random, restarts: int) -> list[list[int]]:
    """One round, greedy-with-restarts in integer space (mirrors _greedy_fill)."""
    best: list[list[int]] | None = None
    best_cost: int | None = None
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
                cost = 0
                for m in group:
                    cost += cnt[pb + m]
                if low is None or cost < low:
                    low, cands = cost, [idx]
                elif cost == low:
                    cands.append(idx)
            members[rng.choice(cands)].append(p)
        rc = 0
        for group in members:
            for i in range(len(group)):
                gi = group[i] * n
                for j in range(i + 1, len(group)):
                    rc += cnt[gi + group[j]]
        if best_cost is None or rc < best_cost:
            best_cost, best = rc, members
        if best_cost == 0:
            break
    return best or [[] for _ in sizes]


def _greedy_plan_int(present: list[int], base: list[int], n: int, sizes: list[int],
                     horizon: int, rng: random.Random, restarts: int,
                     deadline: float) -> list[list[list[int]]]:
    """Greedy plan for the whole horizon (warm start), counting history `base`."""
    cnt = base[:]
    plan: list[list[list[int]]] = []
    for _ in range(horizon):
        r = restarts if time.perf_counter() < deadline else 1
        rnd = _seat_greedy_int(present, cnt, n, sizes, rng, r)
        plan.append(rnd)
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                cnt[a * n + b] += 1
                cnt[b * n + a] += 1
    return plan


def _anneal_plan_int(present: list[int], base: list[int], n: int, sizes: list[int],
                     warm: list[list[list[int]]], rng: random.Random,
                     iters: int | None, deadline: float) -> tuple[list[list[list[int]]], int]:
    """Simulated annealing over the warm-start plan; returns (best_plan, future_repeats).

    Swaps two people at different tables within a round (sizes preserved).
    Counts history `base` as fixed; only planned rounds are mutated. Stops at the
    iteration cap or the wall-clock deadline, whichever comes first.
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

    cur = sum(
        cnt[present[ii] * n + present[jj]] - 1
        for ii in range(len(present)) for jj in range(ii + 1, len(present))
        if cnt[present[ii] * n + present[jj]] > 1
    )

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

        delta = 0
        for k in range(len(a_tbl)):
            if k == ia:
                continue
            m = a_tbl[k]
            if cnt[xb + m] >= 2:
                delta -= 1
            if cnt[yb + m] >= 1:
                delta += 1
        for k in range(len(b_tbl)):
            if k == ib:
                continue
            m = b_tbl[k]
            if cnt[xb + m] >= 1:
                delta += 1
            if cnt[yb + m] >= 2:
                delta -= 1

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
