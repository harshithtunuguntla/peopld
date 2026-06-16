# Peopld — Event Networking Platform (Pre-MVP)

A structured networking app for live events. Attendees join an event, get seated at
a table, see an AI icebreaker for their tablemates, rotate every few minutes, and
walk away with a digital rolodex of everyone they met. Built for a ~40-person pilot
in Hyderabad.

> **New here? Start with these, in order:**
> 1. [`AGENTS.md`](AGENTS.md) — the vision and philosophy (what this is and why)
> 2. [`PRODUCT.md`](PRODUCT.md) — current status, the **Decision Log**, and links to every doc
> 3. [`docs/product/releases/pre-mvp.md`](docs/product/releases/pre-mvp.md) — the **active build spec** (features, data models, endpoints)
> 4. [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md) — the **design system** (theme, tokens, components)

## Repo layout

| Path | What it is |
|------|------------|
| `frontend/` | Next.js (React + TypeScript) app → deploys to Vercel |
| `backend/` | FastAPI (Python) API → deploys to Google Cloud Run |
| `supabase/` | Postgres schema + `migrations/` (run these in your Supabase project) |
| `docs/` | Product, architecture, design, and API docs (see `docs/api/API_SPEC.md`) |

## Tech stack

- **Frontend:** Next.js App Router, TypeScript, Tailwind, semantic shadcn tokens
- **Backend:** FastAPI with type hints, Supabase service-role client (DI via `Depends(get_supabase)`)
- **Database / Auth / Realtime:** Supabase (Postgres + Realtime + Auth)
- **Auth:** organizers email/password (`role=organizer`); attendees Google sign-in or email OTP
- **LLM:** Claude (Sonnet) for icebreakers

## Running it locally

### Backend (`backend/`)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements-dev.txt
copy .env.example .env            # then fill in Supabase keys, Claude key, FRONTEND_URL
uvicorn app.main:app --reload     # http://localhost:8000  (Swagger at /docs)
pytest                            # in-memory fake DB — no Supabase/network needed
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install
# .env.local needs: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                       # http://localhost:3000
npm run build                     # production build (also runs type + lint checks)
```

### Database
Run the SQL in `supabase/migrations/` against your Supabase project **in order**.
⚠️ For current features you need **006** (likes + avatars) and **007** (notes +
interests) applied, in addition to 001–005. `supabase/schema.sql` is the
consolidated picture.

## The two flows (the happy paths to test)

**Attendee:** land on `/` (marketing) → **Sign in / Sign up** (Google or email OTP)
→ **hub** (`/home`) with three buttons:
- **Join via access code** — type the code the organizer reads out
- **Join via QR** — in-app camera scanner (or scan the organizer QR with the phone camera → `/join?code=…`)
- **My connections** — your cross-event rolodex

…→ register (name / role / interests) → **waiting room** (`/event/:id/live`) → organizer
starts → your table + icebreaker → rotate each round → rolodex of everyone you met.

**Organizer:** `/organizer/login` → **dashboard** (create an event; **generate /
regenerate / remove** its access code) → **People** (walk-ins, QR invite, CSV export)
→ **Run event** (control room: start rounds, live room-pulse, end + analytics).

## Conventions that matter

- **Mobile-first, but laptop is first-class.** Design at 375px, then widen with
  `sm:`/`lg:` grids. Check both before you ship a screen.
- **Theme is pinned per route, never toggled.** The landing (`/`) is locked LIGHT;
  every app surface is DARK via its segment `layout.tsx`. Components use semantic
  tokens (`bg-background`, `text-foreground`, …) so they adapt automatically — never
  hard-code colors. See DESIGN_SYSTEM §1.5.
- **Realtime is a doorbell; REST is the source of truth.** Live screens recover full
  state from an authoritative snapshot, not from socket payloads (REQ-RT-01).
- **Attendee identity comes from the JWT, never the URL.** Live/connection endpoints
  resolve "who am I" from the token; only `:eventId` lives in the path.
- **Secrets live in their own RLS-locked tables** (access codes, likes, notes) —
  service-role only, never readable by attendee phones.
- The **build spec is law**: build what's in `pre-mvp.md`, nothing more, nothing less.
