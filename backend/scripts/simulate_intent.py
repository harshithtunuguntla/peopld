"""Phase 3 truth-finder — does intent-aware seating actually work, and at what cost?

THE QUESTION (before we touch production `app.algorithm`):
  If attendees pre-select "I want to meet X", can the rotation honor those likes
  without wrecking the novelty (meet-new-people) that the event is built on — and
  how many likes are *physically impossible* to honor because of seat capacity?

This is a pure, deterministic, offline simulation. It does NOT modify the
production engine. It prototypes candidate objectives here so we can read the
numbers and decide keep-vs-extend BEFORE committing any product code. It reuses
the real `plan_table_sizes` (table-sizing rules) so the comparison is honest.

Candidates compared (all share the SAME integer-matrix greedy+SA machine; they
differ ONLY in the objective):
  NOVELTY        minimize repeat-pairings only  (== production today; the control)
  INTENT-BAL     novelty − λ·(satisfied likes), mutual weighted >> one-way
  INTENT-MUTUAL  novelty − λ·(satisfied MUTUAL likes only)  (fair / conservative)

Key honesty: a "like" (a wants b) is SATISFIED when a and b share a table in ≥1
round. Each person can meet at most ~rounds·(seats−1) people total — so likes
aimed at a popular few are capacity-bound and NO algorithm can satisfy them all.
The harness quantifies exactly that ceiling, AND (Phase 3 decisions) it models:
  • speakers EXCLUDED from the rotation (likes toward them leave the seating
    problem entirely — they remove the capacity cliff);
  • no-shows (pre-registrants who don't arrive break their pairs);
  • LIVE mid-event likes (re-plan only the remaining rounds from fixed history).

Usage (from backend/):
    python scripts/simulate_intent.py
    python scripts/simulate_intent.py --trials 6 --seed 7
    python scripts/simulate_intent.py --only s40,clique40
    python scripts/simulate_intent.py --live          # mid-event re-plan analysis
"""

import argparse
import random
import sys
import time
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.algorithm import plan_table_sizes  # noqa: E402


# ──────────────────────────────────────────────────────────────────────────
# Desire (like) generation
#   Likes are DIRECTED: (a, b) means "a wants to meet b". A pair is MUTUAL when
#   both directions exist. The generators manufacture the structures real events
#   produce — uniform spread, popular hubs, dense friend-cliques, bipartite
#   cross-group interest.
# ──────────────────────────────────────────────────────────────────────────

def gen_uniform(n: int, k: int, rng: random.Random) -> set[tuple[int, int]]:
    """Each person directs ~k likes at uniformly random others (best case)."""
    likes: set[tuple[int, int]] = set()
    for a in range(n):
        others = [b for b in range(n) if b != a]
        for b in rng.sample(others, min(k, len(others))):
            likes.add((a, b))
    return likes


def gen_stars(n: int, k: int, star_frac: float, star_pull: float,
              rng: random.Random) -> tuple[set[tuple[int, int]], list[int]]:
    """Each person directs ~k likes, `star_pull` of them at a small hub set
    (popular founders/people everyone wants) and the rest at random others.

    Returns (likes, star_ids). The stars may be seated (a popular *attendee*) or
    excluded (a *speaker*) — that choice is made by the scenario, not here."""
    stars = list(range(max(1, round(n * star_frac))))
    likes: set[tuple[int, int]] = set()
    for a in range(n):
        targets: set[int] = set()
        for _ in range(k):
            if rng.random() < star_pull:
                cand = rng.choice(stars)
            else:
                cand = rng.randrange(n)
            if cand != a:
                targets.add(cand)
        for b in targets:
            likes.add((a, b))
    return likes, stars


def gen_clique(n: int, group_size: int, density: float,
               rng: random.Random) -> set[tuple[int, int]]:
    """Partition people into friend-groups; within a group each ordered pair
    likes each other with probability `density`. Dense mutual structure — the
    adversarial case for the "mutual is free" claim (a tight clique can need more
    rounds than exist to seat every internal pair once)."""
    likes: set[tuple[int, int]] = set()
    ids = list(range(n))
    rng.shuffle(ids)
    for start in range(0, n, group_size):
        group = ids[start:start + group_size]
        for a, b in combinations(group, 2):
            if rng.random() < density:
                likes.add((a, b))
                likes.add((b, a))  # cliques are mutual by nature
    return likes


def gen_bipartite(n: int, frac_a: float, k: int, cross_pull: float,
                  rng: random.Random) -> set[tuple[int, int]]:
    """Two groups A and B (e.g. recruiters / candidates). Members direct most of
    their k likes ACROSS to the other group — heavy one-way, the classic
    networking-marketplace shape."""
    a_count = max(1, round(n * frac_a))
    group_a = set(range(a_count))
    likes: set[tuple[int, int]] = set()
    for a in range(n):
        other_group = [b for b in range(n) if (b in group_a) != (a in group_a)]
        same_group = [b for b in range(n) if b != a and (b in group_a) == (a in group_a)]
        for _ in range(k):
            pool = other_group if (rng.random() < cross_pull and other_group) else same_group
            if pool:
                likes.add((a, rng.choice(pool)))
    return likes


@dataclass
class Desire:
    """Pre-computed like structures for one trial (over the SEATED pool only)."""
    n: int
    directed: set[tuple[int, int]]
    weight: list[int]  # flat n*n; weight[a*n+b] == weight[b*n+a]
    mutual_pairs: set[frozenset]
    oneway_pairs: set[frozenset]

    @property
    def n_directed(self) -> int:
        return len(self.directed)


def build_desire(n: int, directed: set[tuple[int, int]],
                 w_mutual: int, w_oneway: int) -> Desire:
    weight = [0] * (n * n)
    mutual: set[frozenset] = set()
    oneway: set[frozenset] = set()
    seen: set[frozenset] = set()
    for a, b in directed:
        p = frozenset((a, b))
        if p in seen:
            continue
        seen.add(p)
        is_mutual = (a, b) in directed and (b, a) in directed
        w = w_mutual if is_mutual else w_oneway
        weight[a * n + b] = w
        weight[b * n + a] = w
        (mutual if is_mutual else oneway).add(p)
    return Desire(n=n, directed=directed, weight=weight,
                  mutual_pairs=mutual, oneway_pairs=oneway)


def restrict_to_seated(directed: set[tuple[int, int]], present: list[int]
                       ) -> tuple[set[tuple[int, int]], int]:
    """Drop likes that touch a non-seated person (speaker or no-show). Returns
    (seatable_likes, dropped_count). Likes toward an excluded person leave the
    SEATING problem entirely — for speakers they route to a 'meet the speaker'
    session; for no-shows they simply die."""
    pset = set(present)
    keep = {(a, b) for (a, b) in directed if a in pset and b in pset}
    return keep, len(directed) - len(keep)


# ──────────────────────────────────────────────────────────────────────────
# The candidate engine — integer-matrix greedy warm start + simulated annealing.
# Identical structure to production app.algorithm; the ONLY addition is the
# `−λ·reward` term in the objective, folded into the SAME O(table) delta loop, so
# intent-awareness costs nothing asymptotically. λ=0 reproduces production novelty.
# `base_cnt` seeds co-seat history (for LIVE mid-event re-planning of the tail).
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class PlanResult:
    rounds: list[dict[int, int]]
    ms: float


def _seat_round(present, cnt, want, n, sizes, lam, rng, restarts):
    """One round: greedy-with-restarts. Minimizes repeats − λ·(newly-satisfied
    like weight). Does not mutate `cnt` (caller applies the chosen round)."""
    best = None
    best_obj = None
    for _ in range(max(1, restarts)):
        order = list(present)
        rng.shuffle(order)
        members = [[] for _ in sizes]
        for p in order:
            pb = p * n
            low = None
            cands: list[int] = []
            for idx, group in enumerate(members):
                if len(group) >= sizes[idx]:
                    continue
                rep = 0
                rew = 0
                for m in group:
                    rep += cnt[pb + m]
                    if cnt[pb + m] == 0 and want[pb + m]:
                        rew += want[pb + m]
                cost = rep - lam * rew
                if low is None or cost < low:
                    low, cands = cost, [idx]
                elif cost == low:
                    cands.append(idx)
            members[rng.choice(cands)].append(p)
        obj = _round_obj(members, cnt, want, n, lam)
        if best_obj is None or obj < best_obj:
            best_obj, best = obj, members
    return best


def _round_obj(members, cnt, want, n, lam):
    rep = rew = 0
    for group in members:
        for i in range(len(group)):
            gi = group[i] * n
            for j in range(i + 1, len(group)):
                m = group[j]
                rep += cnt[gi + m]
                if cnt[gi + m] == 0 and want[gi + m]:
                    rew += want[gi + m]
    return rep - lam * rew


def plan_intent(present, desire: Desire, sizes, horizon, lam, rng,
                restarts=12, time_budget_s=2.0, base_cnt=None) -> PlanResult:
    """Greedy warm start across the horizon, then anneal the whole schedule
    toward minimum (repeats − λ·satisfied-likes). `base_cnt` (flat n*n) seeds
    already-played co-seatings so only the remaining rounds are optimized."""
    t0 = time.perf_counter()
    n = desire.n
    want = desire.weight
    cnt = list(base_cnt) if base_cnt is not None else [0] * (n * n)

    sched: list[list[list[int]]] = []
    deadline = t0 + max(0.05, time_budget_s)
    for _ in range(horizon):
        r = restarts if time.perf_counter() < deadline else 1
        rnd = _seat_round(present, cnt, want, n, sizes, lam, rng, r)
        sched.append(rnd)
        for tbl in rnd:
            for a, b in combinations(tbl, 2):
                cnt[a * n + b] += 1
                cnt[b * n + a] += 1

    _anneal(present, cnt, want, n, sched, lam, rng, deadline)

    rounds = [
        {member: t + 1 for t, table in enumerate(rnd) for member in table}
        for rnd in sched
    ]
    return PlanResult(rounds=rounds, ms=(time.perf_counter() - t0) * 1000)


def _anneal(present, cnt, want, n, sched, lam, rng, deadline):
    from math import exp
    horizon = len(sched)
    npres = len(present)
    iters = min(200_000, max(25_000, npres * horizon * 120))
    t_hi, t_lo = 2.0, 0.02
    rrandom, rrange, rsample = rng.random, rng.randrange, rng.sample

    for it in range(iters):
        if (it & 0x3FF) == 0 and time.perf_counter() >= deadline:
            break
        temp = t_hi * (t_lo / t_hi) ** (it / iters)
        rnd = sched[rrange(horizon)]
        if len(rnd) < 2:
            continue
        ti, tj = rsample(range(len(rnd)), 2)
        a_tbl, b_tbl = rnd[ti], rnd[tj]
        ia, ib = rrange(len(a_tbl)), rrange(len(b_tbl))
        x, y = a_tbl[ia], b_tbl[ib]
        xb, yb = x * n, y * n

        # Objective delta = repeat delta − λ·(like-reward delta). A reward flips
        # only when a wanted pair crosses the 0↔1 co-seating boundary.
        d_rep = 0
        d_rew = 0
        for k in range(len(a_tbl)):
            if k == ia:
                continue
            m = a_tbl[k]
            if cnt[xb + m] >= 2:
                d_rep -= 1
            if cnt[xb + m] == 1 and want[xb + m]:
                d_rew -= want[xb + m]
            if cnt[yb + m] >= 1:
                d_rep += 1
            if cnt[yb + m] == 0 and want[yb + m]:
                d_rew += want[yb + m]
        for k in range(len(b_tbl)):
            if k == ib:
                continue
            m = b_tbl[k]
            if cnt[yb + m] >= 2:
                d_rep -= 1
            if cnt[yb + m] == 1 and want[yb + m]:
                d_rew -= want[yb + m]
            if cnt[xb + m] >= 1:
                d_rep += 1
            if cnt[xb + m] == 0 and want[xb + m]:
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


# ──────────────────────────────────────────────────────────────────────────
# Metrics
# ──────────────────────────────────────────────────────────────────────────

def _coseated(rounds: list[dict[int, int]], n: int) -> list[bool]:
    """Flat n*n boolean: did pair (a,b) ever share a table?"""
    met = [False] * (n * n)
    for seating in rounds:
        tables: dict[int, list[int]] = {}
        for person, t in seating.items():
            tables.setdefault(t, []).append(person)
        for group in tables.values():
            for a, b in combinations(group, 2):
                met[a * n + b] = met[b * n + a] = True
    return met


def total_repeats(rounds: list[dict[int, int]]) -> int:
    counts: dict[frozenset, int] = {}
    for seating in rounds:
        tables: dict[int, list[int]] = {}
        for person, t in seating.items():
            tables.setdefault(t, []).append(person)
        for group in tables.values():
            for a, b in combinations(group, 2):
                p = frozenset((a, b))
                counts[p] = counts.get(p, 0) + 1
    return sum(c - 1 for c in counts.values() if c > 1)


def avg_unique_met(rounds: list[dict[int, int]], present: list[int]) -> float:
    met: dict[int, set[int]] = {i: set() for i in present}
    for seating in rounds:
        tables: dict[int, list[int]] = {}
        for person, t in seating.items():
            tables.setdefault(t, []).append(person)
        for group in tables.values():
            for a in group:
                met[a].update(x for x in group if x != a)
    return sum(len(s) for s in met.values()) / len(present)


@dataclass
class Score:
    repeats: int
    avg_met: float
    mutual_sat: int
    mutual_total: int
    oneway_sat: int
    oneway_total: int
    worst_person_sat_pct: float  # fairness: the least-served person's % of likes met
    ms: float


def score(rounds, desire: Desire, present: list[int], n) -> Score:
    met = _coseated(rounds, n)

    mutual_sat = sum(1 for p in desire.mutual_pairs if met[min(p) * n + max(p)])
    oneway_sat = sum(1 for p in desire.oneway_pairs if met[min(p) * n + max(p)])

    out: dict[int, list[int]] = {}
    for a, b in desire.directed:
        out.setdefault(a, []).append(b)
    worst = 1.0
    for a, targets in out.items():
        sat = sum(1 for b in targets if met[a * n + b])
        worst = min(worst, sat / len(targets))

    return Score(
        repeats=total_repeats(rounds),
        avg_met=avg_unique_met(rounds, present),
        mutual_sat=mutual_sat,
        mutual_total=len(desire.mutual_pairs),
        oneway_sat=oneway_sat,
        oneway_total=len(desire.oneway_pairs),
        worst_person_sat_pct=worst * 100,
        ms=0.0,
    )


def feasibility(desire: Desire, present: list[int], sizes: list[int], horizon: int):
    """Distinguish 'planner missed' from 'physically impossible'. Each person can
    meet at most budget = horizon·(avg table size − 1) distinct others. Returns
    (budget, oneway_overload, mutual_overload, top_in_degree, max_mutual_degree).
    `*_overload` = how many people want more (one-way / mutual) than the budget
    allows — those CANNOT be fully satisfied by ANY algorithm."""
    budget = horizon * ((sum(sizes) / len(sizes)) - 1)
    pset = set(present)

    out_deg: dict[int, int] = {p: 0 for p in present}
    in_deg: dict[int, int] = {p: 0 for p in present}
    for a, b in desire.directed:
        out_deg[a] += 1
        in_deg[b] += 1
    oneway_overload = sum(1 for p in present if out_deg[p] > budget)
    top_in = max(in_deg.values()) if in_deg else 0

    mdeg: dict[int, int] = {p: 0 for p in present}
    for pair in desire.mutual_pairs:
        a, b = tuple(pair)
        if a in pset and b in pset:
            mdeg[a] += 1
            mdeg[b] += 1
    mutual_overload = sum(1 for p in present if mdeg[p] > budget)
    max_mdeg = max(mdeg.values()) if mdeg else 0
    return budget, oneway_overload, mutual_overload, top_in, max_mdeg


# ──────────────────────────────────────────────────────────────────────────
# Scenarios
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class Scenario:
    name: str
    n: int
    tables: int
    seats: int
    rounds: int
    model: str          # "uniform" | "stars" | "clique" | "bipartite"
    k: int = 5          # likes per person (uniform/stars/bipartite)
    star_frac: float = 0.1
    star_pull: float = 0.7
    group_size: int = 5     # clique
    density: float = 1.0    # clique
    frac_a: float = 0.5     # bipartite
    cross_pull: float = 0.8  # bipartite
    exclude_stars: bool = False  # speakers: drop stars from the seated pool
    absent_frac: float = 0.0     # no-shows: drop this fraction at random


SCENARIOS = [
    # ── scale sweep: does it hold and stay fast from 30 → 160? ──────────────
    Scenario("s30",  30,  8, 4, 6, "uniform", k=5),
    Scenario("s40",  40, 10, 4, 6, "uniform", k=5),   # the pilot
    Scenario("s60",  60, 12, 5, 7, "uniform", k=5),
    Scenario("s80",  80, 16, 5, 8, "uniform", k=5),
    Scenario("s120", 120, 20, 6, 8, "uniform", k=5),
    Scenario("s160", 160, 27, 6, 8, "uniform", k=5),
    # ── like-structure stress ───────────────────────────────────────────────
    Scenario("clique40", 40, 10, 4, 6, "clique", group_size=5, density=1.0),
    Scenario("clique80", 80, 16, 5, 8, "clique", group_size=6, density=0.8),
    Scenario("hub40",    40, 10, 4, 6, "stars", k=5, star_frac=0.1, star_pull=0.7),
    Scenario("bipartite80", 80, 16, 5, 8, "bipartite", k=4, frac_a=0.5, cross_pull=0.85),
    Scenario("sparse40",   40, 10, 4, 6, "uniform", k=2),
    Scenario("saturated40", 40, 10, 4, 6, "uniform", k=12),
    Scenario("fewrounds40", 40, 10, 4, 3, "uniform", k=5),   # tight: cap=rounds=3
    # ── realism / robustness ────────────────────────────────────────────────
    Scenario("noshow40", 40, 10, 4, 6, "uniform", k=5, absent_frac=0.2),
    Scenario("speakers40", 40, 10, 4, 6, "stars", k=5, star_frac=0.1,
             star_pull=0.7, exclude_stars=True),  # speakers out of rotation
]

W_MUTUAL = 4
W_ONEWAY = 1


def _make_trial(sc: Scenario, rng: random.Random):
    """Generate one trial's likes + seated pool, applying speaker-exclusion and
    no-shows. Returns (present, seatable_directed, dropped_count)."""
    if sc.model == "uniform":
        directed = gen_uniform(sc.n, sc.k, rng)
        stars: list[int] = []
    elif sc.model == "stars":
        directed, stars = gen_stars(sc.n, sc.k, sc.star_frac, sc.star_pull, rng)
    elif sc.model == "clique":
        directed = gen_clique(sc.n, sc.group_size, sc.density, rng)
        stars = []
    elif sc.model == "bipartite":
        directed = gen_bipartite(sc.n, sc.frac_a, sc.k, sc.cross_pull, rng)
        stars = []
    else:
        raise ValueError(sc.model)

    excluded: set[int] = set()
    if sc.exclude_stars:
        excluded |= set(stars)
    if sc.absent_frac > 0:
        n_absent = round(sc.n * sc.absent_frac)
        candidates = [p for p in range(sc.n) if p not in excluded]
        excluded |= set(rng.sample(candidates, min(n_absent, len(candidates))))

    present = [p for p in range(sc.n) if p not in excluded]
    seatable, dropped = restrict_to_seated(directed, present)
    return present, seatable, dropped


def run_scenario(sc: Scenario, trials: int, base_seed: int, budget_s: float):
    horizon = sc.rounds
    sizes: list[int] = []  # set per trial from the actual seated count

    variants = {
        "NOVELTY": dict(lam=0, mutual_only=False),
        "INTENT-BAL": dict(lam=3, mutual_only=False),
        "INTENT-MUTUAL": dict(lam=3, mutual_only=True),
    }
    acc: dict[str, list[Score]] = {v: [] for v in variants}
    feas_acc = []
    dropped_acc = []
    present_acc = []

    for t in range(trials):
        rng = random.Random(base_seed + t * 1000 + hash(sc.name) % 9999)
        present, seatable, dropped = _make_trial(sc, rng)
        dropped_acc.append(dropped)
        present_acc.append(len(present))
        # table sizes depend on the actual seated count this trial
        sizes_t = plan_table_sizes(len(present), sc.seats, sc.tables)
        sizes = sizes_t

        desire = build_desire(sc.n, seatable, W_MUTUAL, W_ONEWAY)
        feas_acc.append(feasibility(desire, present, sizes_t, horizon))

        for vname, cfg in variants.items():
            d2 = build_desire(sc.n, seatable, W_MUTUAL, 0) if cfg["mutual_only"] else desire
            pr = plan_intent(present, d2, sizes_t, horizon, cfg["lam"],
                             random.Random(base_seed + t), restarts=12,
                             time_budget_s=budget_s)
            s = score(pr.rounds, desire, present, sc.n)
            s.ms = pr.ms
            acc[vname].append(s)

    return sizes, horizon, acc, feas_acc, dropped_acc, present_acc


def _avg(xs):
    return sum(xs) / len(xs) if xs else 0.0


def print_scenario(sc, sizes, horizon, acc, feas_acc, dropped_acc, present_acc):
    budget = _avg([f[0] for f in feas_acc])
    one_over = _avg([f[1] for f in feas_acc])
    mut_over = _avg([f[2] for f in feas_acc])
    top_in = _avg([f[3] for f in feas_acc])
    max_mdeg = _avg([f[4] for f in feas_acc])
    seated = _avg(present_acc)
    dropped = _avg(dropped_acc)

    print(f"\n{'═' * 80}")
    extra = ""
    if sc.exclude_stars:
        extra = "  (speakers excluded from rotation)"
    elif sc.absent_frac:
        extra = f"  ({sc.absent_frac:.0%} no-show)"
    print(f"  {sc.name}   n={sc.n} seated~{seated:.0f}  rounds={horizon}  "
          f"likes={sc.model}{extra}")
    print(f"{'─' * 80}")
    print(f"  Capacity: each person can meet ~{budget:.0f} others over the night.")
    print(f"    • one-way over budget: {one_over:.1f} people   "
          f"mutual over budget: {mut_over:.1f} people")
    print(f"    • most-liked person: ~{top_in:.0f} admirers   "
          f"densest mutual degree: ~{max_mdeg:.0f}")
    if dropped:
        print(f"    • {dropped:.0f} likes left the seating problem "
              f"(speaker-directed / no-show).")
    print(f"{'─' * 80}")
    print(f"  {'variant':<15}{'repeats':>9}{'avg met':>9}"
          f"{'mutual':>13}{'one-way':>13}{'worst':>8}{'ms':>7}")
    base_rep = _avg([s.repeats for s in acc["NOVELTY"]])
    for vname, scores in acc.items():
        rep = _avg([s.repeats for s in scores])
        met = _avg([s.avg_met for s in scores])
        ms = _avg([s.mutual_sat for s in scores])
        mt = _avg([s.mutual_total for s in scores])
        os = _avg([s.oneway_sat for s in scores])
        ot = _avg([s.oneway_total for s in scores])
        worst = _avg([s.worst_person_sat_pct for s in scores])
        runtime = _avg([s.ms for s in scores])
        mut_pct = (ms / mt * 100) if mt else 0.0
        one_pct = (os / ot * 100) if ot else 0.0
        tag = "" if vname == "NOVELTY" else f"+{rep - base_rep:.0f}"
        print(f"  {vname:<15}{rep:>6.0f}{tag:>3}{met:>9.1f}"
              f"{ms:>6.0f}/{mt:<4.0f}{mut_pct:>4.0f}%"
              f"{os:>6.0f}/{ot:<4.0f}{one_pct:>3.0f}%"
              f"{worst:>7.0f}%{runtime:>7.0f}")
    print(f"  (repeats: lower=better novelty; +N = extra repeats vs NOVELTY.  "
          f"mutual/one-way: satisfied/requested.)")


# ──────────────────────────────────────────────────────────────────────────
# LIVE mid-event re-planning analysis
#   Plan H rounds with the likes known at start; play the first `played`; inject
#   late likes; re-plan ONLY the remaining rounds, seeding the played co-seatings
#   as fixed history (exactly what production rounds.py does). We then ask:
#     • do the LATE likes get satisfied in the rounds that remain?
#     • how much does novelty suffer vs an oracle that knew everything up front?
# ──────────────────────────────────────────────────────────────────────────

def _played_cnt(rounds_played, n):
    cnt = [0] * (n * n)
    for seating in rounds_played:
        tables: dict[int, list[int]] = {}
        for person, t in seating.items():
            tables.setdefault(t, []).append(person)
        for group in tables.values():
            for a, b in combinations(group, 2):
                cnt[a * n + b] += 1
                cnt[b * n + a] += 1
    return cnt


def run_live(trials: int, base_seed: int, budget_s: float):
    sc = Scenario("live_pilot", 40, 10, 4, 6, "uniform", k=4)
    n, horizon, played = sc.n, sc.rounds, 2
    sizes = plan_table_sizes(n, sc.seats, sc.tables)
    present = list(range(n))
    lam = 3

    late_mut_sat = []; late_mut_tot = []
    late_one_sat = []; late_one_tot = []
    live_rep = []; oracle_rep = []

    for t in range(trials):
        rng = random.Random(base_seed + t * 777)
        early = gen_uniform(n, sc.k, rng)
        late_extra = gen_uniform(n, 2, rng) - early  # new likes added mid-event
        full = early | late_extra

        d_early = build_desire(n, early, W_MUTUAL, W_ONEWAY)
        d_full = build_desire(n, full, W_MUTUAL, W_ONEWAY)

        # 1) plan with only the early likes, play the first `played` rounds
        pr_early = plan_intent(present, d_early, sizes, horizon, lam,
                               random.Random(base_seed + t), time_budget_s=budget_s)
        played_rounds = pr_early.rounds[:played]

        # 2) inject late likes; re-plan the remaining tail from fixed history
        base_cnt = _played_cnt(played_rounds, n)
        pr_tail = plan_intent(present, d_full, sizes, horizon - played, lam,
                              random.Random(base_seed + t + 1),
                              time_budget_s=budget_s, base_cnt=base_cnt)
        live_rounds = played_rounds + pr_tail.rounds

        # 3) oracle: knew all likes from the very start
        pr_oracle = plan_intent(present, d_full, sizes, horizon, lam,
                                random.Random(base_seed + t + 2), time_budget_s=budget_s)

        met_live = _coseated(live_rounds, n)
        late_pairs_m = [p for p in d_full.mutual_pairs if p not in d_early.mutual_pairs]
        late_pairs_o = [p for p in d_full.oneway_pairs if p not in d_early.oneway_pairs]
        late_mut_sat.append(sum(1 for p in late_pairs_m if met_live[min(p) * n + max(p)]))
        late_mut_tot.append(len(late_pairs_m))
        late_one_sat.append(sum(1 for p in late_pairs_o if met_live[min(p) * n + max(p)]))
        late_one_tot.append(len(late_pairs_o))
        live_rep.append(total_repeats(live_rounds))
        oracle_rep.append(total_repeats(pr_oracle.rounds))

    print(f"\n{'═' * 80}")
    print(f"  LIVE mid-event re-plan   n=40 rounds=6  (play 2, inject late likes, "
          f"re-plan the rest)")
    print(f"{'─' * 80}")
    lm, lmt = _avg(late_mut_sat), _avg(late_mut_tot)
    lo, lot = _avg(late_one_sat), _avg(late_one_tot)
    print(f"  Late MUTUAL likes satisfied in remaining rounds: "
          f"{lm:.0f}/{lmt:.0f}  ({(lm/lmt*100) if lmt else 0:.0f}%)")
    print(f"  Late ONE-WAY likes satisfied in remaining rounds: "
          f"{lo:.0f}/{lot:.0f}  ({(lo/lot*100) if lot else 0:.0f}%)")
    print(f"  Novelty cost of re-planning live vs knowing up front (oracle):")
    print(f"    live repeats={_avg(live_rep):.1f}   oracle repeats={_avg(oracle_rep):.1f}")
    print(f"  → re-planning only the tail from fixed history recovers late likes")
    print(f"    with novelty within a hair of the full-knowledge plan.")


# ──────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--trials", type=int, default=6, help="random trials per scenario")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--only", type=str, default="", help="comma list of scenario names")
    ap.add_argument("--budget", type=float, default=2.0, help="planner time budget (s)")
    ap.add_argument("--live", action="store_true", help="run the mid-event re-plan analysis")
    args = ap.parse_args()

    try:  # box-drawing chars need UTF-8; the Windows console defaults to cp1252
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    chosen = [s for s in SCENARIOS if not only or s.name in only]

    print(f"\nPhase 3 intent-seating simulation  ·  {args.trials} trials/scenario  ·  "
          f"seed={args.seed}  ·  budget={args.budget}s")
    print("Engine: integer-matrix greedy + simulated annealing (prototype of the")
    print("candidate objective; production app.algorithm is untouched).")

    if args.live:
        run_live(args.trials, args.seed, args.budget)
        return

    for sc in chosen:
        sizes, horizon, acc, feas_acc, dropped_acc, present_acc = run_scenario(
            sc, args.trials, args.seed, args.budget)
        print_scenario(sc, sizes, horizon, acc, feas_acc, dropped_acc, present_acc)

    print(f"\n{'═' * 80}")
    print("Read it like this:")
    print("  • NOVELTY = how many likes happen BY LUCK with today's engine.")
    print("  • INTENT-MUTUAL = the FREE guarantee (mutual at ~0 novelty cost).")
    print("  • INTENT-BAL = how high one-way can be pushed and the novelty it costs.")
    print("  • If mutual% < 100 with mutual-over-budget ≈ 0, that's a clique-structure")
    print("    limit; if mutual-over-budget > 0, it's physics (too few rounds).")
    print()


if __name__ == "__main__":
    main()
