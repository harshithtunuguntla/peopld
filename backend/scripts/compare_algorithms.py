"""Greedy vs Re-planning — is it worth upgrading the live rotation algorithm?

This harness answers one question with data: across many room shapes (small ->
giant), and under BOTH a stable roster AND realistic mid-event churn (late
arrivals + early leavers), how much less overlap does the RE-PLANNING optimizer
produce than our current GREEDY algorithm — and does it hold up at scale?

It drives the REAL production code in app.algorithm:
  GREEDY        generate_rotation, re-run each round on whoever is present
                (the current engine; myopic, optimises one round at a time).
  RE-PLAN       plan_rounds, following the "plan once / re-plan only when the
                roster changes" strategy (the candidate engine). Lookahead +
                automatic absorption of late arrivals / early leavers.
  OPTIMAL*      one full-horizon plan over the stable roster — the best
                achievable when nobody arrives late or leaves (a ceiling, only
                meaningful in the stable condition).

Metric: total repeat-pairings across the event = Σ pairs max(times − 1, 0);
lower = less overlap = better. Pure dry-run, deterministic with --seed.

Usage (from backend/):
    python scripts/compare_algorithms.py
    python scripts/compare_algorithms.py --only pilot,large,giga --seed 7
"""

import argparse
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from itertools import combinations
from math import comb
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.algorithm import generate_rotation, plan_rounds  # noqa: E402


# ──────────────────────────────────────────────────────────────────────────
# Metrics (work on any sequence of seatings: list[dict[id -> table_number]])
# ──────────────────────────────────────────────────────────────────────────

def total_repeats(seq) -> int:
    """Total repeat-pairings over the event = Σ pairs max(times_together − 1, 0)."""
    counts: dict[frozenset, int] = {}
    for seating in seq:
        for members in _by_table(seating).values():
            for a, b in combinations(members, 2):
                p = frozenset((a, b))
                counts[p] = counts.get(p, 0) + 1
    return sum(c - 1 for c in counts.values() if c > 1)


def first_overlap(seq) -> int | None:
    """Round number where the first repeat appears (None if never)."""
    counts: dict[frozenset, int] = {}
    for idx, seating in enumerate(seq, 1):
        for members in _by_table(seating).values():
            for a, b in combinations(members, 2):
                p = frozenset((a, b))
                if counts.get(p, 0) > 0:
                    return idx
                counts[p] = counts.get(p, 0) + 1
    return None


def _by_table(seating) -> dict[int, list]:
    g: dict[int, list] = {}
    for aid, t in seating.items():
        g.setdefault(t, []).append(aid)
    return g


def _accumulate(pair_counts: dict[frozenset, int], seating: dict[str, int]) -> None:
    for members in _by_table(seating).values():
        for a, b in combinations(members, 2):
            p = frozenset((a, b))
            pair_counts[p] = pair_counts.get(p, 0) + 1


def _seated_pairings(seq) -> int:
    return sum(comb(len(members), 2) for seating in seq for members in _by_table(seating).values())


# ──────────────────────────────────────────────────────────────────────────
# Presence schedules (who is in the room each round)
# ──────────────────────────────────────────────────────────────────────────

def stable_presence(ids: list[str], rounds: int) -> list[list[str]]:
    """Everyone present every round."""
    return [list(ids) for _ in range(rounds)]


def churn_presence(ids: list[str], rounds: int, rng: random.Random,
                   late_frac: float = 0.15, leave_frac: float = 0.10) -> list[list[str]]:
    """Realistic mid-event churn: ~15% arrive late, ~10% leave early.

    Late arrivals appear at the start of round 2 or 3; leavers vanish before the
    last one or two rounds. Both strategies are driven by the SAME schedule, so
    the comparison is apples-to-apples.
    """
    n = len(ids)
    n_late = max(1, int(n * late_frac))
    n_leave = max(1, int(n * leave_frac))
    pool = list(ids)
    rng.shuffle(pool)
    late = {p: rng.choice([2, 3]) for p in pool[:n_late]}
    leavers = {p: rng.choice([rounds - 1, rounds]) for p in pool[n_late:n_late + n_leave]}
    return [
        [i for i in ids
         if not (i in late and r < late[i]) and not (i in leavers and r >= leavers[i])]
        for r in range(1, rounds + 1)
    ]


# ──────────────────────────────────────────────────────────────────────────
# GREEDY — the production algorithm, re-run each round on who is present
# ──────────────────────────────────────────────────────────────────────────

def greedy_live(presence: list[list[str]], tables: int, seats: int,
                rng: random.Random, restarts: int) -> list[dict[str, int]]:
    pair_counts: dict[frozenset, int] = {}
    seq = []
    for present in presence:
        rot = generate_rotation(present, pair_counts, tables, seats, rng=rng, restarts=restarts)
        seq.append(rot.tables)
        _accumulate(pair_counts, rot.tables)
    return seq


# ──────────────────────────────────────────────────────────────────────────
# RE-PLAN and OFFLINE both drive the REAL production planner
# (app.algorithm.plan_rounds) — so this harness validates shipping code.
# ──────────────────────────────────────────────────────────────────────────

def replan_live(presence: list[list[str]], tables: int, seats: int, rng: random.Random,
                restarts: int, time_budget: float) -> list[dict[str, int]]:
    """Plan the remaining schedule, FOLLOW it, re-plan only when the roster changes.

    On a stable roster this plans once and follows it (= offline optimum); under
    churn it re-plans from whoever is present, absorbing arrivals / leavers.
    """
    pair_counts: dict[frozenset, int] = {}
    committed: list[dict[str, int]] = []
    plan: list[dict[str, int]] = []
    plan_present: frozenset | None = None
    plan_offset = 0
    R = len(presence)

    for r in range(R):
        present = presence[r]
        present_set = frozenset(present)
        if plan_present != present_set:  # first round, or roster changed -> re-plan
            rp = plan_rounds(list(present), pair_counts, tables, seats, R - r,
                             rng=rng, warm_restarts=restarts, time_budget_s=time_budget)
            plan, plan_present, plan_offset = rp.rounds, present_set, r
        seating = plan[r - plan_offset]
        committed.append(seating)
        _accumulate(pair_counts, seating)
    return committed


def offline_optimal(ids: list[str], tables: int, seats: int, rounds: int,
                    rng: random.Random, restarts: int, time_budget: float) -> list[dict[str, int]]:
    """Best achievable for a STABLE roster — one full-horizon plan, no churn."""
    return plan_rounds(list(ids), {}, tables, seats, rounds,
                       rng=rng, warm_restarts=restarts, time_budget_s=time_budget).rounds


# ──────────────────────────────────────────────────────────────────────────
# Scenarios + runner
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class Scenario:
    label: str
    n: int
    tables: int
    seats: int
    rounds: int


SCENARIOS = [
    Scenario("tiny",        12,   3, 4,  6),
    Scenario("small",       20,   5, 4,  8),
    Scenario("small-odd",   18,   5, 4,  7),
    Scenario("pilot",       40,  10, 4,  8),
    Scenario("pilot-long",  40,  10, 4, 12),
    Scenario("medium",      50,  10, 5, 10),
    Scenario("medium-odd",  43,   9, 5,  9),
    Scenario("large",       80,  16, 5, 12),
    Scenario("huge",       120,  24, 5, 12),
    Scenario("very-huge",  200,  40, 5, 14),
    Scenario("xl",         300,  60, 5, 14),
    Scenario("xxl",        500, 100, 5, 16),
    Scenario("mega",       800, 134, 6, 16),
    Scenario("giga",      1000, 167, 6, 18),
]


def _budget(n: int) -> tuple[int, float]:
    """Greedy restarts + SA wall-clock budget, scaled so big rooms stay tractable.

    The SAME restarts feed greedy AND the planner's warm start, so the baseline
    and the candidate use identical greedy strength — a fair comparison.
    """
    restarts = 20 if n <= 200 else 8 if n <= 500 else 4
    time_budget = min(8.0, max(2.0, n / 100))
    return restarts, time_budget


@dataclass
class Result:
    scenario: Scenario
    condition: str
    greedy_rep: int
    replan_rep: int
    optimal_rep: int | None
    greedy_fo: int | None
    replan_fo: int | None
    total_pairings: int
    secs: float

    @property
    def improvement_pct(self) -> int:
        if self.greedy_rep == 0:
            return 0
        return round(100 * (self.greedy_rep - self.replan_rep) / self.greedy_rep)


def run_scenario(sc: Scenario, seed: int) -> list[Result]:
    ids = [f"p{i:04d}" for i in range(sc.n)]
    restarts, tb = _budget(sc.n)
    results = []

    for condition in ("stable", "churn"):
        rng = random.Random(seed)
        presence = (stable_presence(ids, sc.rounds) if condition == "stable"
                    else churn_presence(ids, sc.rounds, rng))

        t0 = time.perf_counter()
        g_seq = greedy_live(presence, sc.tables, sc.seats, rng, restarts)
        r_seq = replan_live(presence, sc.tables, sc.seats, rng, restarts, tb)
        opt = (total_repeats(offline_optimal(ids, sc.tables, sc.seats, sc.rounds, rng, restarts, tb))
               if condition == "stable" else None)
        secs = time.perf_counter() - t0

        results.append(Result(
            scenario=sc, condition=condition,
            greedy_rep=total_repeats(g_seq), replan_rep=total_repeats(r_seq),
            optimal_rep=opt, greedy_fo=first_overlap(g_seq), replan_fo=first_overlap(r_seq),
            total_pairings=_seated_pairings(g_seq), secs=secs,
        ))
    return results


# ──────────────────────────────────────────────────────────────────────────
# Reporting
# ──────────────────────────────────────────────────────────────────────────

def print_table(all_results: list[Result]) -> None:
    print("\n" + "=" * 84)
    print("  GREEDY vs RE-PLANNING  -  total repeat-pairings (lower = less overlap)")
    print("=" * 84)
    print(f"  {'scenario':<12}{'cond':<8}{'people':>6}{'rounds':>7} | "
          f"{'greedy':>7}{'replan':>7}{'opt*':>6} | {'improv':>7}{'g.over':>7}{'secs':>7}")
    print("  " + "-" * 80)
    for r in all_results:
        sc = r.scenario
        opt = "-" if r.optimal_rep is None else str(r.optimal_rep)
        over = "-" if not r.greedy_fo else f"R{r.greedy_fo}"
        print(f"  {sc.label:<12}{r.condition:<8}{sc.n:>6}{sc.rounds:>7} | "
              f"{r.greedy_rep:>7}{r.replan_rep:>7}{opt:>6} | "
              f"{str(r.improvement_pct) + '%':>7}{over:>7}{r.secs:>7.1f}")
    print("  " + "-" * 80)
    print("  improv = how much less overlap re-planning produced vs greedy")
    print("  opt*   = offline best for a fully-stable roster (approx ceiling)")
    print("  g.over = round greedy's first repeat appeared; secs = wall time for the row\n")


def write_html(path: str, all_results: list[Result], seed: int) -> None:
    def cell(r: Result) -> str:
        imp = r.improvement_pct
        tone = "good" if imp >= 25 else "ok" if imp >= 10 else "flat"
        opt = "—" if r.optimal_rep is None else str(r.optimal_rep)
        denom = r.total_pairings or 1
        g_pct = round(100 * r.greedy_rep / denom, 1)
        r_pct = round(100 * r.replan_rep / denom, 1)
        return (
            f"<tr><td>{r.scenario.label}</td><td>{r.condition}</td>"
            f"<td>{r.scenario.n}</td><td>{r.scenario.tables}×{r.scenario.seats}</td>"
            f"<td>{r.scenario.rounds}</td>"
            f"<td>{r.greedy_rep} <span class=muted>({g_pct}%)</span></td>"
            f"<td><b>{r.replan_rep}</b> <span class=muted>({r_pct}%)</span></td>"
            f"<td>{opt}</td><td class={tone}>{imp}%</td><td class=muted>{r.secs:.1f}s</td></tr>"
        )

    stable = [r for r in all_results if r.condition == "stable"]
    churn = [r for r in all_results if r.condition == "churn"]
    avg_imp_stable = round(sum(r.improvement_pct for r in stable) / max(len(stable), 1))
    avg_imp_churn = round(sum(r.improvement_pct for r in churn) / max(len(churn), 1))
    rows = "".join(cell(r) for r in all_results)

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Greedy vs Re-planning</title>
<style>
 body{{font:14px system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111}}
 h1{{font-size:20px}} table{{border-collapse:collapse;margin-top:10px;width:100%}}
 td,th{{border:1px solid #e5e7eb;padding:4px 9px;text-align:right;font-size:13px}}
 th{{background:#f9fafb}} td:first-child,td:nth-child(2){{text-align:left}}
 .muted{{color:#9ca3af;font-size:11px}} .good{{background:#dcfce7;color:#166534;font-weight:600}}
 .ok{{background:#fef9c3;color:#854d0e;font-weight:600}} .flat{{background:#f3f4f6;color:#6b7280}}
 .head{{background:#eff6ff;border:1px solid #bfdbfe;padding:12px 16px;border-radius:8px}}
 .explain{{background:#f9fafb;border:1px solid #eef0f2;border-radius:6px;padding:10px 14px;
   margin-top:14px;font-size:13px;line-height:1.6;color:#374151}}
</style></head><body>
<h1>Greedy vs Re-planning — overlap comparison</h1>
<div class="head">
 Lower repeat-pairings = less overlap = better mixing. Both columns drive the real
 production code (<code>app.algorithm</code>).
 <b>Re-planning cut overlap by ~{avg_imp_stable}% on a stable roster and ~{avg_imp_churn}% under
 mid-event churn</b>, on average across {len(stable)} room shapes (seed {seed}).
</div>
<table>
 <tr><th>scenario</th><th>condition</th><th>people</th><th>tables</th><th>rounds</th>
 <th>greedy repeats</th><th>re-plan repeats</th><th>optimal*</th><th>improvement</th><th>time</th></tr>
 {rows}
</table>
<div class="explain">
 <b>How to read this.</b> Each row is one room shape under one condition.
 <b>greedy</b> = the current production engine (<code>generate_rotation</code>);
 <b>re-plan</b> = the candidate engine (<code>plan_rounds</code>: plan the remaining
 rounds, follow them, re-plan when the roster changes); <b>optimal*</b> = one full
 offline plan over a perfectly stable roster (an approximate ceiling, meaningful only
 in the stable rows). The <b>%</b> in parentheses is repeats as a share of all seated
 pairings — even greedy is low in absolute terms, so the relative improvement matters
 more than the raw count.
 <br><br>
 <b>Churn rows are the important ones:</b> they prove re-planning keeps working when
 ~15% arrive late and ~10% leave early mid-event — both engines are driven by the
 exact same presence schedule, so the comparison is fair. <b>time</b> is the wall
 clock for the whole row (both engines), showing the planner stays practical at scale.
</div>
</body></html>"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(html, encoding="utf-8")
    print(f"  HTML comparison written: {path}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare greedy vs re-planning rotation strategies.")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--reports-dir", type=str, default="reports")
    ap.add_argument("--only", type=str, default=None,
                    help="comma-separated scenario labels to run (default: all)")
    args = ap.parse_args()

    scenarios = SCENARIOS
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        scenarios = [s for s in SCENARIOS if s.label in wanted]

    all_results: list[Result] = []
    for sc in scenarios:
        print(f"  running {sc.label} ({sc.n}p, {sc.tables}x{sc.seats}, {sc.rounds}r)...", flush=True)
        all_results.extend(run_scenario(sc, args.seed))

    print_table(all_results)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = str(Path(args.reports_dir) / f"compare-greedy-vs-replan-{stamp}.html")
    write_html(out, all_results, args.seed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
