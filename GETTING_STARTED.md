# Getting Started — Peopld (Event Networking Platform)

How to run this project from a fresh clone, and how authentication works.
For project vision/status read `AGENTS.md` → `PRODUCT.md` → `docs/product/releases/pre-mvp.md` (the build spec).

> **Current working branch: `feat/step-1-scaffold`** — do not merge to main without team agreement.
> Progress: Steps 1–3 of the 7-step build order are complete (see PRODUCT.md → Build Order).

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.10+ | Backend (FastAPI). Docker image pins 3.10 |
| Node.js | 18+ | Frontend (Next.js 15) |
| Git | any recent | |

You also need **access to the team's Supabase project** (ask a teammate for the keys — they are never committed).

---

## 2. Clone & branch

```bash
git clone https://github.com/harshithtunuguntla/peopld.git
cd peopld
git checkout feat/step-1-scaffold
```

---

## 3. Backend setup (FastAPI)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt   # includes runtime deps + pytest
```

Create `backend/.env` (gitignored — NEVER commit it):

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # ask a teammate; this key bypasses RLS — treat like a root password
ANTHROPIC_API_KEY=                        # empty until Step 6 (icebreaker engine)
FRONTEND_URL=http://localhost:3000
```

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Swagger docs: http://localhost:8000/docs

### Backend tests

```bash
pytest          # 61 tests, no network needed (in-memory fake DB + fake auth)
```

Live end-to-end test against the real Supabase (server must be running):

```bash
python scripts/smoke_live.py    # 54 checks: every endpoint, every permission path,
                                # plus an attacker-with-public-key RLS simulation.
                                # Creates throwaway users/events and cleans up after itself.
```

---

## 4. Frontend setup (Next.js)

```bash
cd frontend
npm install
```

Create `frontend/.env.local` (gitignored):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   # the public key (safe in browsers; RLS protects data)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run the dev server:

```bash
npm run dev          # http://localhost:3000
npm run build        # production build + strict TypeScript check
```

---

## 5. Supabase setup (only when creating a NEW project)

The team project is already configured. If you ever need to recreate it:

1. **Schema:** run `supabase/schema.sql` in the SQL Editor, then every file in `supabase/migrations/` in order (001 is a security fix — not optional).
2. **Google sign-in:** Google Cloud Console → OAuth client (web), redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` → paste Client ID/Secret into Authentication → Sign In / Providers → Google.
3. **Email OTP:** Authentication → SMTP Settings → custom SMTP (we use Gmail: `smtp.gmail.com:587` + an app password). Set Email OTP Length to 6. Edit the **Magic Link** email template to include `{{ .Token }}` (otherwise users get a link instead of a code).
4. **Rate limits:** Authentication → Rate Limits → raise emails/hour (default is ~2).
5. **Organizer account:** Authentication → Users → Add user (email+password), then from `backend/`:
   ```bash
   python scripts/tag_organizer.py organizer@example.com
   ```
   (The dashboard can't edit `app_metadata`; this script sets `role=organizer` via the admin API.)

### Useful dev scripts (run from `backend/`)

| Script | Purpose |
|---|---|
| `python scripts/tag_organizer.py <email>` | Grant organizer role to an auth user |
| `python scripts/seed_dev_event.py <organizer-email>` | Create a test event + print the frontend URLs |
| `python scripts/test_otp_email.py <email>` | Send a real OTP email to verify SMTP delivery |
| `python scripts/smoke_live.py` | Full live verification suite |

---

## 6. How authentication works (Step 3 — implemented & verified)

### The model: one identity, role-based access (RBAC)

There is **one user store** (Supabase `auth.users`). What you can *do* comes from
roles and ownership — not from which login page you used:

- **Organizers** have `app_metadata.role = "organizer"` on their auth user
  (set via `tag_organizer.py`; there is no self-serve organizer signup for the pilot).
- **Attendees** are any authenticated user; "being an attendee of event X" simply
  means having a row in the `attendees` table linked by `user_id`.
- One person can be both (an organizer can also register as an attendee — the
  register page detects this and shows a notice).

### Login methods

| Audience | Methods | Where |
|---|---|---|
| Attendees | **Google sign-in** OR **6-digit email OTP** (their choice, two equal buttons) | `/event/:id/register` |
| Organizers | Email + password | `/organizer/login` |

Same email via Google AND OTP resolves to the **same** account (Supabase links
identities with matching verified emails — see Authentication → Users → click a
user → linked identities). Phone OTP was deliberately deferred to MVP
(India DLT registration lead time — see PRODUCT.md Decision Log).

### How a request is authenticated

1. Frontend holds a Supabase session (cookies, via `@supabase/ssr`; middleware refreshes it).
2. `lib/api.ts` attaches `Authorization: Bearer <JWT>` to every backend call automatically.
3. Backend (`app/deps.py`) verifies the token with `supabase.auth.get_user()`:
   - `get_current_user` → any signed-in user
   - `get_current_organizer_id` → additionally requires `role=organizer`
   - ownership helpers 403 anyone who isn't the event's owner
4. Registration links `attendees.user_id` to the JWT identity and **dedupes**:
   re-registering returns the existing record (HTTP 200) instead of creating a duplicate.
   `GET /events/:id/attendees/me` lets the frontend skip the form for returning users.

### Access-control map

| Resource | Who |
|---|---|
| Event details, current round, table assignments | Public (no PII — needed for landing page & realtime) |
| Attendee profile / full list / rolodex / icebreakers / analytics | Self and/or event organizer only |
| All writes | JWT-verified + ownership-checked |
| Direct DB reads with the public anon key | Blocked by RLS for anything with PII (verified by the smoke test's attacker simulation) |

### Security invariants (do not break these)

- The **service-role key** lives only in `backend/.env` — never in frontend code, never committed.
- All writes and all PII reads go **through the FastAPI backend**. The frontend never
  queries the `attendees` table directly.
- Realtime tables (`rounds`, `table_assignments`, `icebreakers`) are client-readable —
  **never put PII columns on them** (relevant for Steps 5–6).
- New endpoints exposing per-person data must use the self-or-organizer pattern
  (see `app/routers/connections.py` for the reference implementation).

---

## 7. The happy path to test manually

Register → see "already registered" on revisit → organizer login → dashboard.

1. `python scripts/seed_dev_event.py <your-organizer-email>` → open the printed Register URL
2. Sign in with Google or email code → fill the form → Join
3. Revisit the register URL → "You're already registered ✅" + redirect
4. `http://localhost:3000/organizer/login` → email/password → dashboard shows your email

If anything fails, run `python scripts/smoke_live.py` first — it pinpoints which layer is broken.
