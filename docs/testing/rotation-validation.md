# Validating the Rotation Algorithm — Step-by-Step

A runbook for **seeing** the rotation algorithm work: how many rounds let people
meet all-new faces, exactly when repeats ("overlap") start, and how fast the real
endpoints respond. Anyone on the team can follow this from a fresh clone.

> **You do NOT create mock data by hand.** The tool generates fake attendees for
> you (`Founder 000`, `Founder 001`, …) and puts them in a throwaway, clearly
> marked `[SANDBOX]` event. You only choose *how many* people, tables, seats, and
> rounds. Nothing touches your real events.

---

## What you'll end up with

- A **terminal report**: "Rounds 1–5 were 100% new faces. First overlap appeared in round 6," plus a per-round breakdown and live latency (p50/p95).
- A **standalone HTML report** you open in any browser. Every run is saved as its
  own timestamped file in **`backend/reports/`** (e.g. `db-40p-10t-4s-12r-20260613-110600.html`) —
  **nothing is ever overwritten**, so you can compare runs. `db-…` = real-DB run,
  `dry-…` = dry-run. (Pass `--html path.html` to force one exact filename instead.)

The HTML report has six sections, each with a **collapsible "What this tells you"**
explanation (the first is open, the rest expand on click) and a colour verdict badge
(green = good, amber = okay, red = look closer):

1. **Novelty over time** — the headline curve: ours vs naive-random vs theoretical best.
2. **Per-round novelty vs repeats** — green/red bars; where red starts is the saturation point.
3. **Pairing heatmap** — who-met-whom grid that darkens as overlap begins.
4. **Timing per round** — real DB latency for `start`/`publish`/`end` per round + totals
   (dry-run shows pure algorithm compute time instead).
5. **The ideal number** — the theoretical ceiling for *this* room shape, and why.
6. **Who sat with whom, each round** — the actual table-by-table seating to eyeball.

---

## Two ways to run it

| Mode | Command flag | Needs | Use it for |
|---|---|---|---|
| **Dry-run** | `--dry-run` | nothing (no DB, no server) | Instant. Sweep many room shapes in seconds to see the algorithm's behaviour |
| **Live** | *(no flag)* | migration 002 + server running | Real database + **real latency** measurement — closest thing to event day |

Start with **dry-run** to get a feel for it (zero setup). Use **live** when you want
the latency numbers and to prove the real endpoints work end-to-end.

---

## One-time setup (fresh clone)

```bash
git clone https://github.com/harshithtunuguntla/peopld.git
cd peopld
git checkout feat/step-1-scaffold

cd backend
python -m venv .venv
.venv\Scripts\activate              # Windows
# source .venv/bin/activate         # macOS / Linux
pip install -r requirements-dev.txt
```

Create `backend/.env` (ask a teammate for the keys — never committed):

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # bypasses RLS — treat like a root password
ANTHROPIC_API_KEY=
FRONTEND_URL=http://localhost:3000
```

**Database migration (once per Supabase project):** the validation tool needs the
Step 4 tables. On our shared team project this is **already done** — you don't need
to repeat it. Only if you ever create a *new* Supabase project: open the SQL Editor
and run, in order, `supabase/migrations/001_tighten_rls.sql` then
`supabase/migrations/002_step4_rounds.sql`.

---

## A) Dry-run (instant, no setup beyond the venv)

From `backend/` with the venv active:

```bash
python scripts/validate_rotation.py --dry-run --attendees 40 --tables 10 --seats 4 --rounds 12
```

- Reads the terminal report immediately.
- Open the HTML file it just wrote — every run auto-saves into **`backend/reports/`**
  with a descriptive name (e.g. `dry-40p-10t-4s-12r-<timestamp>.html`). The exact
  path is printed at the end of the run.
- Change the numbers and run again — each run is a new file, nothing overwritten.
  See "Choosing the numbers" below.

Dry-run uses no database and creates no sandbox event, so there is **nothing to
clean up**.

---

## B) Live run (real DB + real latency)

You need **two terminals**, both in `backend/` with the venv active.

**Terminal 1 — start the API server (leave it running):**

```bash
uvicorn app.main:app --port 8000
```

**Terminal 2 — run the validation:**

```bash
python scripts/validate_rotation.py --attendees 40 --tables 10 --seats 4 --rounds 12
```

What happens automatically, in order:

1. Creates a throwaway organizer (`rotation-sandbox@peopld.test`) and a
   `[SANDBOX] Rotation Validation` event in the real database.
2. **Inserts your mock attendees** — 40 fake arrived "Founders" (this is the mock
   data; you didn't have to make it).
3. Drives the real `start → publish → end` endpoints for each round, **timing
   every call**.
4. Prints the terminal report and writes the HTML report into **`backend/reports/`**
   (named `db-40p-10t-4s-12r-<timestamp>.html`); the exact path is printed at the end.
5. Leaves the sandbox event in place and prints its ID so you can inspect it.

**When you're done, clean up (deletes every sandbox event + the sandbox user):**

```bash
python scripts/validate_rotation.py --cleanup
```

> Always run `--cleanup` after a live session so the sandbox data doesn't linger
> in the shared database.

---

## Choosing the numbers (fully configurable — not fixed at 40)

| Flag | Meaning | Example |
|---|---|---|
| `--attendees` | How many people in the room | `--attendees 60` |
| `--tables` | How many physical tables | `--tables 12` |
| `--seats` | Target seats per table (min 3) | `--seats 5` |
| `--rounds` | How many rounds to simulate | `--rounds 15` |
| `--seed` | Repeatable run. In `--dry-run` it pins everything; in live mode it only pins the naive baseline (the live algorithm runs server-side and varies by design — that's intentional) | `--seed 7` |
| `--html NAME` | Choose the report's filename. A bare name still saves **into `backend/reports/`** (e.g. `--html big.html` → `reports/big.html`); only a path with a folder is used as-is | `--html big-room.html` |
| `--reports-dir` | Change the reports folder (default `reports`) | `--reports-dir runs` |

> You don't need `--html` — every run already auto-saves a descriptive, timestamped
> file in `backend/reports/`. Use `--html` only when you want a specific name.

Try a few shapes to validate the algorithm holds up generally (each saves its own
file in `backend/reports/`):

```bash
# A big room with tables of 5
python scripts/validate_rotation.py --dry-run --attendees 70 --tables 14 --seats 5 --rounds 10

# An awkward count (43 doesn't divide evenly)
python scripts/validate_rotation.py --dry-run --attendees 43 --tables 9 --seats 5 --rounds 8

# Small room
python scripts/validate_rotation.py --dry-run --attendees 12 --tables 4 --seats 4 --rounds 6
```

If you ask for more people than the room can hold (e.g. 60 people in 10 tables of 4),
the tool stops with a clear message telling you to raise `--tables` or `--seats` —
the same guard that protects the organizer at the live event.

---

## How to read the report

- **First overlap round** — the round where two people who already met get seated
  together again. Earlier rounds were "all new faces." This is the headline.
- **Ours vs naive-random** — naive (no memory) usually overlaps by round 2. Our
  algorithm holds out much longer; that gap is the proof it works.
- **Theoretical ceiling** — the best any algorithm could do for that room shape.
  We won't hit it exactly (that needs perfect combinatorial scheduling), but we
  should be far above naive.
- **Coverage %** — of all possible pairs in the room, how many have met by the end.
- **Worst-off person** — the attendee who met the fewest unique people (fairness
  check — make sure nobody is left out).
- **Latency p50/p95** (live mode only) — typical and worst-case response time per
  request. This is the event-day readiness signal.

> **Reading the latency numbers:** from a local dev machine you'll typically see
> ~700–900 ms per organizer action (`start`/`publish`). Most of that is network
> distance to Supabase plus one auth round-trip per request — **not** the
> algorithm (which is sub-millisecond). At the event the backend runs on Cloud
> Run; **keep Cloud Run in the same region as the Supabase project** and these
> drop a lot. ~0.8 s is fine for an organizer pressing a button once per 5-minute
> round anyway; it would only matter if it were on the attendee hot path (it isn't —
> attendees get updates via Realtime, Step 5).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Migration 002 is not applied` | Run `supabase/migrations/002_step4_rounds.sql` in the Supabase SQL Editor |
| `API server not reachable at localhost:8000` | Start `uvicorn app.main:app --port 8000` in another terminal (live mode only) |
| `Invalid configuration: … exceed venue capacity` | Too many people for the tables/seats — raise `--tables` or `--seats` |
| Sandbox events piling up in Supabase | Run `python scripts/validate_rotation.py --cleanup` |
| HTML report not found | Every run saves into `backend/reports/`; the exact path is printed at the end of the run |

---

## Quick reference

```bash
# Instant feel for the algorithm (no DB):
python scripts/validate_rotation.py --dry-run --attendees 40 --tables 10 --seats 4 --rounds 12

# Real DB + latency (server must be running in another terminal):
python scripts/validate_rotation.py --attendees 40 --tables 10 --seats 4 --rounds 12

# Remove all sandbox data when finished:
python scripts/validate_rotation.py --cleanup
```

Reports for every run land in `backend/reports/` (never overwritten). Add
`--html myname.html` only if you want to name one yourself — it still saves there.
