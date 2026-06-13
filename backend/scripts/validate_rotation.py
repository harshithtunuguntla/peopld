"""Rotation-algorithm validation harness — against the REAL Supabase DB.

Answers the core question: for a given room shape, how many rounds stay fully
NEW faces, exactly WHEN does the first repeat appear, and how close is that to
the best theoretically possible? Also measures real per-request LATENCY, which
is the unknown that matters on event day.

It is fully parameterized (nothing pinned to 40) and isolated: it creates a
clearly-marked [SANDBOX] event + throwaway users, drives the real
start -> publish -> end endpoints, then can delete everything.

Prerequisites:
    1. Migration 002 applied (round_drafts, audit_log, auto_arrive_on_register).
    2. API server running:  uvicorn app.main:app --port 8000

Usage (from backend/):
    python scripts/validate_rotation.py --attendees 40 --tables 10 --seats 4 --rounds 12
    python scripts/validate_rotation.py --attendees 43 --tables 8 --seats 5 --rounds 8 --html report.html
    python scripts/validate_rotation.py --dry-run --attendees 40 --tables 10 --seats 4 --rounds 12
    python scripts/validate_rotation.py --cleanup          # delete leftover sandboxes
"""

import argparse
import random
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from itertools import combinations
from math import comb, ceil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.algorithm import plan_table_sizes  # noqa: E402
from app.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402

API = "http://localhost:8000"
PASSWORD = "Sandbox-Validate-1234!"
SANDBOX_ORG_EMAIL = "rotation-sandbox@peopld.test"
SANDBOX_TAG = "[SANDBOX] Rotation Validation"


# ──────────────────────────────────────────────────────────────────────────
# Metrics  (work on a sequence of rounds; each round = {attendee_id: table})
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class RoundStat:
    round_number: int
    new_pairs: int
    repeat_pairs: int
    avg_unique_met: float
    min_unique_met: int


@dataclass
class Summary:
    rounds: list[RoundStat] = field(default_factory=list)
    first_overlap_round: int | None = None  # first round with any repeat
    final_avg_unique: float = 0.0
    final_min_unique: int = 0
    worst_attendee_repeats: int = 0
    coverage_pct: float = 0.0  # % of all possible pairs that have met


def summarize(rounds_seq: list[dict[str, int]], num_attendees: int) -> Summary:
    """Per-round novelty + saturation metrics for one sequence of seatings."""
    pair_counts: dict[frozenset, int] = {}
    met: dict[str, set] = {}
    summary = Summary()

    for idx, seating in enumerate(rounds_seq, start=1):
        groups: dict[int, list[str]] = {}
        for attendee_id, table in seating.items():
            groups.setdefault(table, []).append(attendee_id)

        new_pairs = repeat_pairs = 0
        for members in groups.values():
            for a, b in combinations(members, 2):
                pair = frozenset((a, b))
                if pair_counts.get(pair, 0) == 0:
                    new_pairs += 1
                else:
                    repeat_pairs += 1
                pair_counts[pair] = pair_counts.get(pair, 0) + 1
                met.setdefault(a, set()).add(b)
                met.setdefault(b, set()).add(a)

        uniques = [len(met.get(a, set())) for a in seating]
        summary.rounds.append(
            RoundStat(
                round_number=idx,
                new_pairs=new_pairs,
                repeat_pairs=repeat_pairs,
                avg_unique_met=round(sum(uniques) / len(uniques), 1) if uniques else 0.0,
                min_unique_met=min(uniques) if uniques else 0,
            )
        )
        if repeat_pairs > 0 and summary.first_overlap_round is None:
            summary.first_overlap_round = idx

    all_unique = [len(s) for s in met.values()]
    summary.final_avg_unique = round(sum(all_unique) / len(all_unique), 1) if all_unique else 0.0
    summary.final_min_unique = min(all_unique) if all_unique else 0
    summary.worst_attendee_repeats = max(
        (sum(1 for p, c in pair_counts.items() if a in p and c > 1) for a in met), default=0
    )
    total_pairs = comb(num_attendees, 2)
    summary.coverage_pct = round(100 * len(pair_counts) / total_pairs, 1) if total_pairs else 0.0
    return summary


def naive_sequence(ids: list[str], tables: int, seats: int, rounds: int,
                   rng: random.Random) -> list[dict[str, int]]:
    """Control group: random seating each round (same table sizes, no memory)."""
    sizes = plan_table_sizes(len(ids), seats, tables)
    seq = []
    for _ in range(rounds):
        order = list(ids)
        rng.shuffle(order)
        seating, cursor = {}, 0
        for table_idx, size in enumerate(sizes, start=1):
            for person in order[cursor:cursor + size]:
                seating[person] = table_idx
            cursor += size
        seq.append(seating)
    return seq


def theoretical(num_attendees: int, seats: int, rounds: int) -> tuple[list[float], int]:
    """Ideal cumulative-unique curve + the round overlap is first forced.

    Each round one person meets ~(seats-1) others; the ceiling is N-1.
    Approximate for mixed table sizes — labelled as such in the report.
    """
    per_round = max(seats - 1, 1)
    curve = [float(min(r * per_round, num_attendees - 1)) for r in range(1, rounds + 1)]
    forced_overlap_round = (num_attendees - 1) // per_round + 1
    return curve, forced_overlap_round


# ──────────────────────────────────────────────────────────────────────────
# Live driver  (real DB, real endpoints, real latency)
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class LiveRun:
    event_id: str
    attendee_ids: list[str]
    rounds_seq: list[dict[str, int]]
    latencies: dict[str, list[float]]  # endpoint -> [ms, ...]


def _db():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _require_migration(db) -> None:
    try:
        db.table("round_drafts").select("id").limit(1).execute()
        db.table("audit_log").select("id").limit(1).execute()
    except Exception as exc:
        print("\nMigration 002 is not applied — round_drafts / audit_log missing.")
        print("Run supabase/migrations/002_step4_rounds.sql in the SQL editor first.")
        print(f"(detail: {exc})")
        sys.exit(2)


def _sandbox_organizer(db) -> tuple[str, str]:
    """Create (or reset) the throwaway organizer, return (user_id, jwt).

    Deletes any prior sandbox events FIRST — events reference the organizer via
    a non-cascading FK, so the user can't be removed while events still point at
    it. This makes back-to-back runs (without --cleanup) safe.
    """
    for u in db.auth.admin.list_users():
        if u.email == SANDBOX_ORG_EMAIL:
            stale = db.table("events").select("id").eq("organizer_id", u.id).execute().data or []
            for e in stale:
                db.table("events").delete().eq("id", e["id"]).execute()  # cascade
            db.auth.admin.delete_user(u.id)
    user = db.auth.admin.create_user(
        {"email": SANDBOX_ORG_EMAIL, "password": PASSWORD, "email_confirm": True,
         "app_metadata": {"role": "organizer"}}
    ).user
    token = (
        _db().auth.sign_in_with_password(
            {"email": SANDBOX_ORG_EMAIL, "password": PASSWORD}
        ).session.access_token
    )
    return user.id, token


def run_live(attendees: int, tables: int, seats: int, rounds: int) -> LiveRun:
    db = _db()
    _require_migration(db)

    # Fail fast on an impossible room shape (clear message, no half-built sandbox).
    plan_table_sizes(attendees, seats, tables)

    org_id, token = _sandbox_organizer(db)
    hdr = {"Authorization": f"Bearer {token}"}

    with httpx.Client(base_url=API, timeout=60) as api:
        if api.get("/health").status_code != 200:
            print("API server not reachable at localhost:8000 — start uvicorn first.")
            sys.exit(2)

        event = api.post("/events", headers=hdr, json={
            "name": f"{SANDBOX_TAG} — {attendees}p/{tables}t/{seats}s",
            "date": "2026-12-31", "time": "18:00:00",
            "location": "validation-sandbox",
            "description": "Throwaway — safe to delete. Created by validate_rotation.py",
            "num_tables": tables, "seats_per_table": seats,
            "default_round_duration_seconds": 300,
            "auto_arrive_on_register": True,
        }).json()
        event_id = event["id"]

        # Insert synthetic ARRIVED attendees directly (service-role). No auth
        # users needed for attendees — only the organizer JWT drives endpoints.
        rows = [{
            "event_id": event_id, "user_id": None,
            "name": f"Founder {i:03d}", "role": "Founder",
            "looking_for": None, "linkedin_url": None,
            "whatsapp_number": None, "status": "arrived",
        } for i in range(attendees)]
        inserted = db.table("attendees").insert(rows).execute().data
        attendee_ids = [str(a["id"]) for a in inserted]

        latencies: dict[str, list[float]] = {"start": [], "publish": [], "end": []}
        rounds_seq: list[dict[str, int]] = []

        def timed(method: str, path: str) -> httpx.Response:
            t0 = time.perf_counter()
            resp = api.post(path, headers=hdr)
            latencies[method].append((time.perf_counter() - t0) * 1000)
            return resp

        for r in range(1, rounds + 1):
            start = timed("start", f"/events/{event_id}/rounds/start")
            if start.status_code != 201:
                print(f"  round {r}: start -> {start.status_code} {start.text}; stopping early")
                break
            pub = timed("publish", f"/events/{event_id}/rounds/publish")
            if pub.status_code != 201:
                print(f"  round {r}: publish -> {pub.status_code} {pub.text}; stopping early")
                break
            seating = {str(a["attendee_id"]): a["table_number"] for a in pub.json()["assignments"]}
            rounds_seq.append(seating)
            timed("end", f"/events/{event_id}/rounds/end")
            print(f"  round {r}: seated {len(seating)} people, "
                  f"{pub.json().get('round_number')} published")

    return LiveRun(event_id, attendee_ids, rounds_seq, latencies)


# ──────────────────────────────────────────────────────────────────────────
# Reporting  (terminal + standalone HTML)
# ──────────────────────────────────────────────────────────────────────────

def _pct(latencies: list[float], p: float) -> float:
    if not latencies:
        return 0.0
    s = sorted(latencies)
    return round(s[min(len(s) - 1, int(p / 100 * len(s)))], 1)


def print_report(args, ours: Summary, naive: Summary, ideal_overlap: int,
                 latencies: dict[str, list[float]] | None) -> None:
    rounds_run = len(ours.rounds)
    overlap = ours.first_overlap_round
    novel_rounds = (overlap - 1) if overlap else rounds_run
    ratio = round(100 * novel_rounds / max(ideal_overlap - 1, 1)) if ideal_overlap > 1 else 100

    print("\n" + "=" * 64)
    print(f"  ROTATION VALIDATION - {args.attendees} people, "
          f"{args.tables} tables x {args.seats} seats, {rounds_run} rounds")
    print("=" * 64)
    print("\nHEADLINE")
    if overlap:
        print(f"  Rounds 1-{novel_rounds} were 100% new faces. "
              f"First overlap appeared in round {overlap}.")
    else:
        print(f"  All {rounds_run} rounds were 100% new faces — no overlap yet.")
    print(f"  Theoretical ceiling (approx): {ideal_overlap - 1} fully-novel rounds "
          f"-> algorithm reached {ratio}% of ideal.")
    print(f"  Naive-random would have first overlapped in round "
          f"{naive.first_overlap_round or '>' + str(rounds_run)}.")
    print(f"  Everyone met avg {ours.final_avg_unique} unique people "
          f"(worst-off: {ours.final_min_unique}). Pair coverage: {ours.coverage_pct}%.")

    print("\nPER-ROUND  (ours vs naive-random)")
    print(f"  {'rnd':>3} | {'new':>4} {'rep':>4} {'avgU':>5} | "
          f"{'new':>4} {'rep':>4}   (rep = repeat pairings)")
    for o, n in zip(ours.rounds, naive.rounds):
        flag = "  <- overlap begins" if o.round_number == overlap else ""
        print(f"  {o.round_number:>3} | {o.new_pairs:>4} {o.repeat_pairs:>4} "
              f"{o.avg_unique_met:>5} | {n.new_pairs:>4} {n.repeat_pairs:>4}{flag}")

    if latencies:
        print("\nLATENCY  (real request round-trip, ms)")
        print(f"  {'endpoint':>8} | {'p50':>7} {'p95':>7} {'max':>7} {'n':>4}")
        for ep in ("start", "publish", "end"):
            xs = latencies[ep]
            print(f"  {ep:>8} | {_pct(xs, 50):>7} {_pct(xs, 95):>7} "
                  f"{round(max(xs), 1) if xs else 0:>7} {len(xs):>4}")
    print()


def _pill(text: str, tone: str) -> str:
    return f'<span class="pill {tone}">{text}</span>'


def _section(title: str, badge: str, body: str, explain: str, open_: bool = False) -> str:
    """A chart/table + a collapsible 'what this tells you' explanation."""
    o = " open" if open_ else ""
    return (
        f'<section><h2>{title} {badge}</h2>{body}'
        f'<details{o}><summary>What this tells you</summary>'
        f'<div class="explain">{explain}</div></details></section>'
    )


def write_html(path: str, args, ours: Summary, naive: Summary,
               ideal_curve: list[float], ideal_overlap: int,
               rounds_seq: list[dict[str, int]], attendee_ids: list[str],
               latencies: dict[str, list[float]] | None,
               compute_ms: list[float] | None = None) -> None:
    N = args.attendees
    seats = args.seats
    rounds_run = len(ours.rounds)
    overlap = ours.first_overlap_round
    novel = (overlap - 1) if overlap else rounds_run
    ideal_novel = max(ideal_overlap - 1, 1)
    pct_ideal = round(100 * novel / ideal_novel)
    naive_novel = (naive.first_overlap_round - 1) if naive.first_overlap_round else rounds_run
    cov, avg_u, min_u = ours.coverage_pct, ours.final_avg_unique, ours.final_min_unique

    # ---- verdict badges (heuristic thresholds) ----
    nov_badge = (_pill("Strong", "good") if pct_ideal >= 50
                 else _pill("Solid", "ok") if pct_ideal >= 33 else _pill("Modest", "warn"))
    cov_badge = (_pill("Excellent mix", "good") if cov >= 75
                 else _pill("Good mix", "ok") if cov >= 50 else _pill("Low mix", "warn"))
    fair_badge = (_pill("Even spread", "good") if min_u >= 0.85 * avg_u
                  else _pill("Slightly uneven", "ok") if min_u >= 0.7 * avg_u
                  else _pill("Uneven", "warn"))

    # ---- 1. cumulative-unique line chart (ours vs naive vs ideal) ----
    def line(series, color, n):
        if not series:
            return ""
        maxv = max(max(series), 1)
        pts = " ".join(f"{40 + i * (520 / max(n - 1, 1)):.0f},{180 - v / maxv * 150:.0f}"
                       for i, v in enumerate(series))
        return f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2"/>'

    ours_u = [s.avg_unique_met for s in ours.rounds]
    naive_u = [s.avg_unique_met for s in naive.rounds]
    chart = (
        '<svg viewBox="0 0 580 210" class="chart">'
        f'{line(ideal_curve[:rounds_run], "#9ca3af", rounds_run)}'
        f'{line(naive_u, "#ef4444", rounds_run)}'
        f'{line(ours_u, "#2563eb", rounds_run)}</svg>'
        '<p class="legend2"><b style="color:#2563eb">— ours</b> '
        '<b style="color:#ef4444">— naive-random</b> '
        '<b style="color:#9ca3af">— theoretical ceiling</b></p>'
    )
    sec_novelty = _section(
        "Novelty over time", nov_badge, chart,
        f"<b>The headline chart.</b> The average number of <i>different</i> people each "
        f"attendee has met, round by round. Blue (ours) should climb fast and stay well "
        f"above red (naive-random); grey is the best any algorithm could theoretically do."
        f"<br><br><b>This run:</b> by the last round everyone met an average of {avg_u} of "
        f"{N - 1} possible others ({cov}% of all pairs). Ours stayed 100% new for {novel} "
        f"rounds vs naive's {naive_novel} — so the algorithm is clearly doing real work, "
        f"not just shuffling. {nov_badge} = {pct_ideal}% of the theoretical ceiling.",
        open_=True,
    )

    # ---- 2. per-round novelty vs repeats bars ----
    bars = []
    for o in ours.rounds:
        total = o.new_pairs + o.repeat_pairs or 1
        green = round(100 * o.new_pairs / total)
        mark = " ← overlap begins" if o.round_number == overlap else ""
        bars.append(
            f'<div class="bar"><span class="lbl">R{o.round_number}</span>'
            f'<div class="track"><div class="g" style="width:{green}%"></div>'
            f'<div class="r" style="width:{100 - green}%"></div></div>'
            f'<span class="mk">{green}% new{mark}</span></div>'
        )
    sec_bars = _section(
        "Per-round novelty vs repeats",
        _pill(f"First overlap: round {overlap}" if overlap else "No overlap", "ok" if overlap else "good"),
        "".join(bars),
        f"Each bar is one round: green = brand-new introductions, red = repeats (someone "
        f"re-seated with a person they already met). Early rounds are all green; the moment "
        f"red appears is the <b>saturation point</b> — the room starting to run out of "
        f"strangers.<br><br><b>This run:</b> "
        + (f"the first repeat appeared in round {overlap}; rounds 1–{novel} were perfectly new. "
           if overlap else "no repeats at all in this run. ")
        + "Some repeats late in a long event are mathematically unavoidable — see "
          "“The ideal number” below for why.",
    )

    # ---- 3. pairing heatmap ----
    if len(attendee_ids) <= 60 and attendee_ids:
        counts: dict[frozenset, int] = {}
        for seating in rounds_seq:
            g: dict[int, list[str]] = {}
            for aid, t in seating.items():
                g.setdefault(t, []).append(aid)
            for members in g.values():
                for a, b in combinations(members, 2):
                    p = frozenset((a, b))
                    counts[p] = counts.get(p, 0) + 1
        rows = []
        for a in attendee_ids:
            cells = []
            for b in attendee_ids:
                if a == b:
                    cells.append('<td class="self"></td>')
                else:
                    c = counts.get(frozenset((a, b)), 0)
                    k = "c0" if c == 0 else "c1" if c == 1 else "c2" if c == 2 else "c3"
                    cells.append(f'<td class="{k}" title="met {c}x"></td>')
            rows.append("<tr>" + "".join(cells) + "</tr>")
        heat_body = (
            f'<table class="heat">{"".join(rows)}</table>'
            '<p class="legend"><span class="c0"></span>0 <span class="c1"></span>1 '
            '<span class="c2"></span>2 <span class="c3"></span>3+ times</p>'
        )
    else:
        heat_body = '<p class="muted">Heatmap skipped (>60 attendees — too dense to read).</p>'
    sec_heat = _section(
        "Pairing heatmap — who met whom", fair_badge, heat_body,
        f"A grid of every attendee against every other. White = never met, grey = met once, "
        f"amber/red = met 2 or 3+ times. A healthy mixer is <b>mostly grey with little "
        f"amber/red</b>; large red blocks would mean the same people keep colliding."
        f"<br><br><b>This run:</b> the worst-off attendee had {ours.worst_attendee_repeats} "
        f"repeat pairing(s), and the least-connected person still met {min_u} people vs the "
        f"{avg_u} average — {fair_badge} tells you how fairly the meetings were spread.",
    )

    # ---- 4. timing per round ----
    if latencies:
        trows = []
        tot_s = tot_p = tot_e = 0.0
        for i in range(rounds_run):
            s, p, e = latencies["start"][i], latencies["publish"][i], latencies["end"][i]
            tot_s, tot_p, tot_e = tot_s + s, tot_p + p, tot_e + e
            trows.append(f"<tr><td>{i + 1}</td><td>{round(s)}</td><td>{round(p)}</td>"
                         f"<td>{round(e)}</td><td>{round(s + p + e)}</td></tr>")
        grand = tot_s + tot_p + tot_e
        timing_body = (
            '<table class="data"><tr><th>round</th><th>start</th><th>publish</th>'
            f'<th>end</th><th>round total</th></tr>{"".join(trows)}'
            f'<tr class="ttl"><td>Σ</td><td>{round(tot_s)}</td><td>{round(tot_p)}</td>'
            f'<td>{round(tot_e)}</td><td>{round(grand)}</td></tr></table>'
            f'<p class="muted">All values in milliseconds. p50 publish '
            f'{_pct(latencies["publish"], 50)} · p95 publish {_pct(latencies["publish"], 95)}.</p>'
        )
        lat_badge = (_pill("Fine for console", "good") if _pct(latencies["publish"], 50) < 1000
                     else _pill("Acceptable", "ok") if _pct(latencies["publish"], 50) < 2000
                     else _pill("Investigate", "warn"))
        timing_explain = (
            f"How long each organizer action actually took <b>against the real database</b>. "
            f"<b>start</b> generates the draft, <b>publish</b> writes it live (heaviest — it "
            f"inserts every seat and fires Realtime), <b>end</b> closes the round. These are "
            f"full request round-trips (network + one auth check + DB) — <b>not</b> the "
            f"algorithm, which is sub-millisecond.<br><br>Typical publish was "
            f"{_pct(latencies['publish'], 50)}ms; the whole {rounds_run}-round event cost "
            f"{round(grand)}ms of organizer waiting in total. This only affects the organizer "
            f"pressing a button once per round — attendees never wait on it (they get updates "
            f"via Realtime). Deploy the backend in Supabase's region to cut these. {lat_badge}"
        )
        sec_timing = _section("Timing per round (real DB)", lat_badge, timing_body, timing_explain)
    elif compute_ms:
        trows = "".join(f"<tr><td>{i + 1}</td><td>{ms:.2f}</td></tr>"
                        for i, ms in enumerate(compute_ms))
        avg_c = sum(compute_ms) / len(compute_ms)
        timing_body = (
            '<table class="data"><tr><th>round</th><th>algorithm (ms)</th></tr>'
            f'{trows}<tr class="ttl"><td>avg</td><td>{avg_c:.2f}</td></tr></table>'
        )
        sec_timing = _section(
            "Timing per round (pure algorithm)", _pill("Sub-millisecond-class", "good"),
            timing_body,
            "Pure compute time per round with <b>no database</b> — this is “our” cost in "
            "isolation. It stays tiny even at large sizes because the greedy fill with restarts "
            "is cheap. The database round-trips you'd see live are separate — run without "
            "<code>--dry-run</code> to measure those.",
        )
    else:
        sec_timing = ""

    # ---- 5. the ideal number explained ----
    per_round = max(seats - 1, 1)
    sec_ideal = _section(
        "The ideal number for this room", _pill(f"ceiling ≈ {ideal_novel} rounds", "ok"),
        f'<p class="big">Tables of {seats} → each person meets {per_round} new people per '
        f'round → to meet all {N - 1} others needs at least '
        f'⌈{N - 1}/{per_round}⌉ = <b>{ideal_novel}</b> fully-novel rounds.</p>',
        f"That {ideal_novel} is the <b>theoretical ceiling</b> — the most all-new rounds any "
        f"algorithm could possibly produce for {N} people at tables of {seats}. Reaching it "
        f"exactly needs a perfect “resolvable schedule” (a hard combinatorial design, the "
        f"<i>social golfer problem</i>) that a fast greedy algorithm can't construct, so real "
        f"results sit below it.<br><br><b>This run reached {novel} of {ideal_novel} "
        f"({pct_ideal}%).</b> For a ~{N}-person pilot running {rounds_run} rounds that is "
        f"plenty — everyone still meets most of the room. Pushing closer to the ceiling would "
        f"need a heavier forward-planning scheduler (logged as a possible MVP improvement, not "
        f"needed for the pilot).",
    )

    # ---- 6. per-round seating (who sat with whom) ----
    label = {aid: f"#{i + 1}" for i, aid in enumerate(attendee_ids)}
    blocks = []
    for idx, seating in enumerate(rounds_seq, 1):
        g2: dict[int, list[str]] = {}
        for aid, t in seating.items():
            g2.setdefault(t, []).append(aid)
        tbls = "".join(
            f'<div class="tbl"><b>T{t}</b> '
            + ", ".join(sorted((label.get(m, "?") for m in g2[t]),
                               key=lambda x: int(x[1:]))) + "</div>"
            for t in sorted(g2)
        )
        blocks.append(f'<div class="rnd"><div class="rh">Round {idx}</div>{tbls}</div>')
    sec_seating = _section(
        "Who sat with whom, each round", _pill(f"{rounds_run} rounds", "ok"),
        f'<div class="seatwrap">{"".join(blocks)}</div>',
        f"Exactly who shared each table, every round (<code>#n</code> = attendee n, e.g. "
        f"<code>#1</code> is “Founder 000”). Useful for eyeballing the algorithm: no table of "
        f"2, low table numbers used first, and people genuinely reshuffled between rounds "
        f"rather than clustering.",
    )

    headline = (
        f"Rounds 1–{novel} were 100% new faces. First overlap in round {overlap}."
        if overlap else f"All {rounds_run} rounds were 100% new faces — no overlap yet."
    )
    mode = "real DB + latency" if latencies else "dry-run (no DB)"

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Rotation validation — {N}p/{args.tables}t/{seats}s</title>
<style>
 body{{font:14px system-ui,sans-serif;max-width:780px;margin:24px auto;padding:0 16px;color:#111}}
 h1{{font-size:20px;margin-bottom:2px}} h2{{font-size:16px;margin:0 0 6px}}
 section{{margin:26px 0;padding-bottom:6px;border-bottom:1px solid #f0f0f0}}
 .muted{{color:#6b7280;font-size:13px}} .big{{font-size:15px}}
 .head{{background:#eff6ff;border:1px solid #bfdbfe;padding:12px 16px;border-radius:8px;font-size:15px}}
 details{{margin-top:8px}} summary{{cursor:pointer;color:#2563eb;font-size:13px;user-select:none}}
 .explain{{background:#f9fafb;border:1px solid #eef0f2;border-radius:6px;padding:10px 14px;
   margin-top:6px;font-size:13.5px;line-height:1.55;color:#374151}}
 .pill{{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;
   vertical-align:middle}}
 .pill.good{{background:#dcfce7;color:#166534}} .pill.ok{{background:#fef9c3;color:#854d0e}}
 .pill.warn{{background:#fee2e2;color:#991b1b}}
 table.data{{border-collapse:collapse;margin-top:8px}} table.data td,table.data th{{
   border:1px solid #e5e7eb;padding:3px 10px;text-align:right}} table.data th{{background:#f9fafb}}
 table.data tr.ttl td{{font-weight:600;background:#f3f4f6}}
 table.heat{{border-collapse:collapse;margin-top:8px}} table.heat td{{width:9px;height:9px;
   border:1px solid #f3f4f6}}
 .c0{{background:#fff}} .c1{{background:#cbd5e1}} .c2{{background:#fbbf24}} .c3{{background:#dc2626}}
 .self{{background:#1f2937}}
 .legend span{{display:inline-block;width:12px;height:12px;border:1px solid #ccc;
   vertical-align:middle;margin:0 2px 0 10px}}
 .legend2 b{{margin-right:12px}}
 .bar{{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px}}
 .bar .lbl{{width:34px;color:#6b7280}} .bar .mk{{width:170px;color:#6b7280}}
 .track{{flex:1;display:flex;height:13px;border-radius:3px;overflow:hidden}}
 .track .g{{background:#22c55e}} .track .r{{background:#ef4444}}
 svg.chart{{border:1px solid #e5e7eb;border-radius:6px;background:#fff;width:100%}}
 .seatwrap{{max-height:340px;overflow:auto;border:1px solid #eef0f2;border-radius:6px;padding:8px}}
 .rnd{{margin-bottom:10px}} .rh{{font-weight:600;font-size:12px;color:#374151;margin-bottom:2px}}
 .tbl{{display:inline-block;font-size:11.5px;background:#f3f4f6;border-radius:4px;
   padding:2px 7px;margin:2px 4px 2px 0;color:#374151}}
</style></head><body>
<h1>Rotation validation</h1>
<p class="muted">{N} people · {args.tables} tables × {seats} seats · {rounds_run} rounds · {mode}</p>
<div class="head">{headline}<br>
 Theoretical ceiling ≈ {ideal_novel} novel rounds · everyone met avg {avg_u} unique people
 (worst-off {min_u}) · coverage {cov}%.</div>
{sec_novelty}{sec_bars}{sec_heat}{sec_timing}{sec_ideal}{sec_seating}
<p class="muted">Each section's “What this tells you” explains the chart and whether the
 result is good. Click to expand the collapsed ones.</p>
</body></html>"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(html, encoding="utf-8")
    print(f"  HTML report written: {path}")


# ──────────────────────────────────────────────────────────────────────────
# Cleanup
# ──────────────────────────────────────────────────────────────────────────

def cleanup() -> None:
    db = _db()
    org_id = None
    for u in db.auth.admin.list_users():
        if u.email == SANDBOX_ORG_EMAIL:
            org_id = u.id
    deleted = 0
    if org_id:
        events = db.table("events").select("id").eq("organizer_id", org_id).execute().data or []
        for e in events:
            db.table("events").delete().eq("id", e["id"]).execute()  # cascade
            deleted += 1
        db.auth.admin.delete_user(org_id)
    print(f"Cleanup done: removed {deleted} sandbox event(s) and the sandbox organizer.")


# ──────────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Validate the rotation algorithm (real DB + latency).")
    ap.add_argument("--attendees", type=int, default=40)
    ap.add_argument("--tables", type=int, default=10)
    ap.add_argument("--seats", type=int, default=4)
    ap.add_argument("--rounds", type=int, default=12)
    ap.add_argument("--seed", type=int, default=None,
                    help="reproducibility seed. In --dry-run it pins the whole run; "
                         "in live mode it only pins the naive baseline (the live "
                         "algorithm runs server-side and varies by design)")
    ap.add_argument("--html", type=str, default=None,
                    help="name the report file (a bare name still lands in --reports-dir; "
                         "a path with a directory is used as-is). Default: auto-named in --reports-dir")
    ap.add_argument("--reports-dir", type=str, default="reports",
                    help="folder for auto-named reports (each run saved, never overwritten)")
    ap.add_argument("--dry-run", action="store_true",
                    help="skip the DB: run the pure algorithm in-memory (no latency, instant)")
    ap.add_argument("--cleanup", action="store_true", help="delete all sandbox events + users and exit")
    args = ap.parse_args()

    if args.cleanup:
        cleanup()
        return 0

    rng = random.Random(args.seed)

    compute_ms: list[float] | None = None
    if args.dry_run:
        from app.algorithm import generate_rotation
        ids = [f"a{i:03d}" for i in range(args.attendees)]
        compute_ms = []
        try:
            pair_counts: dict[frozenset, int] = {}
            rounds_seq = []
            for _ in range(args.rounds):
                t0 = time.perf_counter()
                rot = generate_rotation(ids, pair_counts, args.tables, args.seats, rng=rng)
                compute_ms.append((time.perf_counter() - t0) * 1000)
                rounds_seq.append(rot.tables)
                groups: dict[int, list[str]] = {}
                for a, t in rot.tables.items():
                    groups.setdefault(t, []).append(a)
                for members in groups.values():
                    for x, y in combinations(members, 2):
                        p = frozenset((x, y))
                        pair_counts[p] = pair_counts.get(p, 0) + 1
        except Exception as exc:
            print(f"Invalid configuration: {exc}")
            return 2
        attendee_ids, latencies = ids, None
    else:
        run = run_live(args.attendees, args.tables, args.seats, args.rounds)
        rounds_seq, attendee_ids, latencies = run.rounds_seq, run.attendee_ids, run.latencies
        if not rounds_seq:
            print("No rounds were published — nothing to report.")
            return 1
        print(f"\n  Sandbox event left in place: {run.event_id}")
        print("  Inspect it, then remove with:  python scripts/validate_rotation.py --cleanup")

    ours = summarize(rounds_seq, args.attendees)
    naive = summarize(
        naive_sequence(attendee_ids, args.tables, args.seats, len(rounds_seq), rng),
        args.attendees,
    )
    ideal_curve, ideal_overlap = theoretical(args.attendees, args.seats, len(rounds_seq))

    print_report(args, ours, naive, ideal_overlap, latencies)

    # Always save a report into the reports folder (never the repo root).
    # Default name = mode + config + timestamp (never overwritten). --html lets
    # you choose the name: a bare filename still lands in --reports-dir; only a
    # path that includes a directory is used verbatim.
    if args.html:
        given = Path(args.html)
        out_path = str(given) if given.parent != Path(".") else str(Path(args.reports_dir) / given.name)
    else:
        mode = "dry" if args.dry_run else "db"
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        fname = f"{mode}-{args.attendees}p-{args.tables}t-{args.seats}s-{len(rounds_seq)}r-{stamp}.html"
        out_path = str(Path(args.reports_dir) / fname)
    write_html(out_path, args, ours, naive, ideal_curve, ideal_overlap,
               rounds_seq, attendee_ids, latencies, compute_ms)
    return 0


if __name__ == "__main__":
    sys.exit(main())
