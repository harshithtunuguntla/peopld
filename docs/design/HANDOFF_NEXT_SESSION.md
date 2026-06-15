# Handoff — Next Session (Peopld / Event Networking Platform)

_Last updated: 2026-06-15. Branch: `feat/rotation-replanning-engine`._

This is the warm-start doc for a fresh agent/session. Read it top to bottom, then read
the three canonical docs it points to. A ready-to-paste **kickoff prompt** is at the bottom.

---

## 1. What this project is
Pre-MVP prototype of a structured **event networking app** for a live ~40-person pilot in
Hyderabad. Attendees register → get seated by rounds → see tablemates + an AI icebreaker →
move tables → leave with a rolodex of who they met. **The build spec is law** —
build only what's in `docs/product/releases/pre-mvp.md`. Mobile-first (375px), reliability first.

- **Frontend:** Next.js 15 (App Router, React 19, TS) → Vercel. Dir: `frontend/`.
- **Backend:** FastAPI (Python, type hints) → Cloud Run. Dir: `backend/`.
- **DB/Auth/Realtime:** Supabase. Migrations in `supabase/` (⚠️ run 006 + 007 before live testing).
- **Read first:** `AGENTS.md`, `PRODUCT.md`, `docs/product/releases/pre-mvp.md`,
  `docs/design/DESIGN_SYSTEM.md`, and `docs/design/UI_IMPORT_HANDOFF.md` (the UI-import master plan).

## 2. The UI-import effort (the current thread of work)
We're importing the look/feel + richer screens from the static prototype
`E:\Shift-Pro\exploring-new\ui-emergent\demo-workup-ui` (reference only — static, no logic)
into the real app, and added a **light/dark theme system (LIGHT default + toggle)**.

Full inventory + phased plan + decisions: **`docs/design/UI_IMPORT_HANDOFF.md` §8**.

### Done so far ✅
1. **Theme foundation** — `frontend/src/lib/theme/theme-provider.tsx` (light default, localStorage)
   + `components/ui/theme-toggle.tsx`; app layouts wrap children in `<ThemeProvider>` (no longer
   hardcode `dark`); extended `globals.css` tokens; DESIGN_SYSTEM §1.5 rewritten.
2. **Light-mode contrast pass** — added theme-aware `success`/`warning`/`info` tokens, deepened
   light `--accent`; migrated bright-brand *text* to readable tokens (brand colors stay as fills).
3. **`/auth` page** — split-screen sign-in/up (dark brand island + theme-aware form), embeds
   `SignInPanel` (Google + email OTP). Landing nav links "Sign in" → `/auth`.
4. **Waiting-room uplift** (`components/live/live-screens.tsx` `WaitingRoom`, takes `state`):
   glowing "You're in" badge + "Hi, {first}", **animated hourglass** (`components/live/hourglass.tsx`,
   framer-motion — no fake timer; host starts rounds by hand), 2-line copy, **"Tonight" agenda card**
   (rounds from `target_rounds`/`ROUNDS`), **live roster card** (real avatars — not hardcoded).
   Backend `LiveStateResponse` gained `event_name, attendee_name, target_rounds, round_seconds,
   roster{count,preview[≤12]}` (see `backend/app/routers/live.py` `_waiting_roster`).
5. **Access-code-only join (security)** — code is given in-room and is the ONLY door in.
   `/join` ignores `?code=` (manual gate); removed hub "Join via QR" + deleted `QrScannerDialog`;
   `InviteDialog` QR opens `/join` only (never the code), code shown large to read aloud.

### Dev access code
`supabase/seed_dev.sql` → run in Supabase SQL editor (set your organizer email) → creates event
**"Peopld Dev Test Meet"** + code **`MEET25`**. Or generate one from the organizer dashboard.

## 3. What's NEXT (pick up here)
Per `UI_IMPORT_HANDOFF.md` §8, in order:

- **Phase 3 — Organizer console shell.** Import the demo `AppShell` →
  `components/organizer/console-shell` + the console `ui` primitives
  (`demo-workup-ui/components/peopld/console/ui.tsx`: Card, PageHeader, StatCard, StatusChip,
  Avatar, Segmented, Toggle, etc.). **Re-home the existing `/organizer` screens under the new
  shell — KEEP the `/organizer` route namespace** (do not move to `/console`).
- **Phase 4 — Organizer screens uplift** — dashboard (only KPIs we can really source), events
  list + create-event wizard + event detail, command center (timer/floor/icebreaker), people,
  Settings→Appearance theme picker. **Skip analytics/billing/AI-ops (not in pre-mvp).**
- **Phase 5 — Attendee uplift** (waiting room ✅ already done) — invite splash, reveal, live
  table polish, + a new **recap** screen.
- **Phase 6 — Docs + tests.**

**Optional smaller win the user flagged:** make the round **agenda organizer-authored** (set
round topic names at event creation). Today the topics are the canonical default `ROUNDS` set
(per the user's "assign something random for now"); the count already honors `target_rounds`.
Doing it for real needs a place to store per-event round topics (event column or rounds rows) +
a create/edit field + surfacing them in the live snapshot's agenda. Confirm scope before building.

## 4. Constraints & gotchas (don't relearn these the hard way)
- **Build spec is law** — analytics, billing, room-energy/AI-ops, attendee↔attendee connect are
  NOT in pre-mvp. Import layout shells only, or skip.
- **Security invariants:** attendee identity is always resolved from the JWT, never the URL.
  Secret tables (access codes, likes, notes) are RLS service-role-only. The access-code value is
  returned only to the owning organizer; audit logs never log code values. Join = code only.
- **Theme:** LIGHT is default; both themes must stay readable. Brand accents
  (coral/ember/chlorine/gold/ice) are tuned for dark → use `success`/`warning`/`info`/`accent`
  tokens for *text* on light; brand colors only as fills. `glow-ember` is a CSS utility class —
  never rename it to a color name. Never hardcode hex outside `lib/design/colors.ts`.
- **Windows/env:** Bash tool cwd resets to repo root each call — use absolute paths or `cd … &&`.
  Run frontend tsc as `node node_modules/typescript/bin/tsc --noEmit` from `frontend/`. ESLint is
  not configured (tsc is the gate). The user usually has the dev server running on :3000 (holds a
  `.next/trace` lock → `next build` can EPERM); rely on tsc, don't kill their server.
- **After Write-creating files,** sanity-check `tail -n1` — an earlier session hit a stray
  `</content>` line appended by the Write tool that broke tsc. (Not seen recently.)
- **Backend changes need a uvicorn restart** for the frontend to see new API fields.

## 5. Verify before you hand off
- Backend: `cd backend && .venv/Scripts/python.exe -m pytest -q` → all green (currently **211**).
- Frontend: `cd frontend && node node_modules/typescript/bin/tsc --noEmit` → clean.
- Manual happy path (mobile 375px **and** laptop ≥1024px): landing → Sign in (`/auth`) → hub →
  Join via access code (`MEET25`) → register → **waiting room** (hourglass + agenda + roster) →
  organizer starts a round → table + icebreaker → … → recap/rolodex.

## 6. Kickoff prompt for the next session
> Continue the Peopld UI-import work. Read `docs/design/HANDOFF_NEXT_SESSION.md` and
> `docs/design/UI_IMPORT_HANDOFF.md` first, plus `AGENTS.md` / `PRODUCT.md` /
> `docs/product/releases/pre-mvp.md` (build spec is law). Phases 1–2, the waiting-room uplift,
> and access-code-only join are done and green. **Start Phase 3: the organizer console shell** —
> import the demo `AppShell` + console `ui` primitives from
> `E:\Shift-Pro\exploring-new\ui-emergent\demo-workup-ui` into `frontend/src/components/organizer`
> and re-home the existing `/organizer` screens under it, **keeping the `/organizer` route
> namespace** and the light-default theme. Skip analytics/billing/AI-ops (not in pre-mvp).
> Keep it mobile-first and readable in both themes. Before coding, give me a short plan of the
> files you'll add/change; verify with backend pytest + frontend tsc when done; then update the
> handoff doc + memory.
