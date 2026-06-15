# PRODUCT.md — Event Networking Platform

> This file tells any agent exactly where the project stands right now.
> Read `AGENTS.md` first for vision and philosophy.

---

## Current Status

| Item | Value |
|---|---|
| **Phase** | Pre-MVP Prototype Build |
| **Target** | Live pilot event (~40 attendees, Hyderabad) |
| **Build Spec** | [`docs/product/releases/pre-mvp.md`](docs/product/releases/pre-mvp.md) |
| **Stack** | Next.js + FastAPI + Supabase + Claude API |
| **Progress** | Steps 1–6 complete (scaffold, CRUD, auth, rotation algorithm, realtime/recovery, icebreaker engine — all tested). Next: Step 7 (Next.js frontend) |
| **Working Branch** | `feat/step-1-scaffold` — do NOT merge to main without team agreement |

---

## Build Order

> **Every agent and teammate must follow this sequence. Do not skip steps. Do not build features out of order.**
>
> **Rule: brainstorm before code.** Each step starts with a short design/requirements session
> (agree on approach, data flow, and edge cases with the team) BEFORE any implementation.
> Steps 4 and 5 especially require an explicit design session — see notes below.

| Step | What | Status |
|---|---|---|
| 1 | **Repo + Foundation** — GitHub monorepo (`/frontend` Next.js, `/backend` FastAPI), Supabase project + SQL schema (`supabase/schema.sql`, 5 tables) | ✅ Done |
| 2 | **FastAPI scaffold + core CRUD** — Events, Attendees, Rounds, Connections, Icebreakers endpoints; 34 unit tests (`backend/tests/`) + live smoke test (`backend/scripts/smoke_live.py`) | ✅ Done |
| 3 | **Auth (deliberately EARLY, not last)** — Attendees: Google sign-in + Email OTP (see Decision Log — phone OTP deferred to MVP); organizers: email/password (manual account, `role=organizer`); replace temporary `X-Organizer-Id` header in `backend/app/deps.py` with Supabase JWT verification; link `attendees.user_id` + dedupe registration | ⏳ Next |
| 4 | **Rotation Algorithm** — draft→preview→publish lifecycle (drafts in non-realtime `round_drafts` so phones see nothing until publish); `auto_arrive_on_register`; audit trail + structured logging. **v2 engine = re-planning optimizer** (`plan_rounds`, simulated annealing): plans the remaining rounds, follows them, re-plans only when the arrived set changes; greedy kept as fallback. Plan cached in `round_plans` (migration 003). Designs: `docs/design/rotation-algorithm.md` (v1 greedy) + `docs/design/rotation-replanning.md` (v2). Validation: `backend/scripts/compare_algorithms.py`. Impl: `backend/app/algorithm.py`, `routers/rounds.py` | ✅ Done |
| 5 | **Supabase Realtime** — principle: *realtime = doorbell, REST = source of truth*. Channel structure agreed = one channel per event (event bus). Backend recovery endpoint `GET /events/:id/live` returns the whole Live Dashboard state in one round-trip. Three reliability requirements: **REQ-RT-01** recover within 3 s on reconnect/refresh/wake/network-regain; **REQ-RT-02** round cancel/rollback (`POST /rounds/cancel` deletes round+assignments, no history pollution); **REQ-RT-03** idempotent publish (retry/double-click → one round). Idempotent publication via migration 004 (rounds + table_assignments + icebreakers; drafts/plans/attendees kept out). Offline viewing supported, offline sync explicitly NOT. Design: `docs/design/realtime.md`. Impl: `backend/app/routers/live.py` + `rounds.py`. Frontend subscription wiring lands in Step 7 against this contract | ✅ Done |
| 6 | **Claude Icebreaker Engine** — 1 LLM call per table per round (batch), **async via BackgroundTasks** (publish never waits; each icebreaker INSERT is a Step-5 doorbell, question pops into `/live`). Claude on **Vertex AI** behind a provider abstraction (`app/icebreakers/provider.py`: vertex/stub/disabled). **All prompts in one place** (`app/icebreakers/prompts.py`) incl. guardrails + curated fallback bank. Per-person fallback on any LLM error/timeout/junk; idempotent batch (retried publish = no-op); synchronous "Generate Another" refresh. People referenced to the model by index, not UUID. No new migration (icebreakers table/publication already existed). Audit `icebreaker.generated/refreshed` (counts only, no PII). Design: `docs/design/icebreakers.md`. Impl: `app/icebreakers/`, `routers/icebreakers.py`, publish seam in `rounds.py`. Provider/model/tunables all env-driven | ✅ Done |
| 7 | **Next.js Frontend** — all 7 pages (4 attendee + 3 organizer), mobile-first 375px; UI design + error states decided just-in-time per page | ⏳ Next |

---

## Where to Find Everything

### 🔨 What We're Building Right Now
| Document | Purpose |
|---|---|
| [`docs/product/releases/pre-mvp.md`](docs/product/releases/pre-mvp.md) | **START HERE.** Complete build spec: features, data models, endpoints, tech stack |
| [`GETTING_STARTED.md`](GETTING_STARTED.md) | Dev onboarding: fresh-clone setup, env files, tests, and how auth works |
| [`docs/testing/rotation-validation.md`](docs/testing/rotation-validation.md) | Step-by-step: validate the rotation algorithm + see latency (shareable runbook) |

### 📋 Release Roadmap
| Document | Purpose |
|---|---|
| [`docs/product/releases/pre-mvp.md`](docs/product/releases/pre-mvp.md) | Prototype for live pilot (CURRENT) |
| [`docs/product/releases/mvp.md`](docs/product/releases/mvp.md) | India-first Event Intelligence Platform |
| [`docs/product/releases/v1.md`](docs/product/releases/v1.md) | Predictive scoring, CRM integrations, multilingual |
| [`docs/product/releases/v2.md`](docs/product/releases/v2.md) | Autonomous AI agents, self-serve sponsor portal |

### 🔍 Discovery & Research (Completed)
| Document | Purpose |
|---|---|
| [`docs/product/discovery/assumptions.md`](docs/product/discovery/assumptions.md) | Validated and unvalidated assumptions |
| [`docs/product/discovery/risks.md`](docs/product/discovery/risks.md) | Known risks and mitigations |
| [`docs/product/discovery/open_questions.md`](docs/product/discovery/open_questions.md) | Unresolved product questions |
| [`docs/product/personas.md`](docs/product/personas.md) | Core persona definitions |
| [`docs/product/event_lifecycle.md`](docs/product/event_lifecycle.md) | Event lifecycle index |
| [`docs/product/lifecycle/`](docs/product/lifecycle/) | Detailed persona journey maps |

### 📦 Features & Prioritization
| Document | Purpose |
|---|---|
| [`docs/product/features/feature_inventory.md`](docs/product/features/feature_inventory.md) | Priority lists (MVP, Revenue, AI, Differentiation) |
| [`docs/product/features/feature_dictionary.md`](docs/product/features/feature_dictionary.md) | Full 13-point feature definitions |
| [`docs/product/features/feature_rationalization.md`](docs/product/features/feature_rationalization.md) | Why features were included, deferred, or rejected |

### 🏗️ Architecture (Discovery Phase)
| Document | Purpose |
|---|---|
| [`docs/architecture/domains/`](docs/architecture/domains/) | 15 DDD domain specifications |
| [`docs/architecture/requirements/mvp_requirements.md`](docs/architecture/requirements/mvp_requirements.md) | MVP architecture requirements |
| [`docs/knowledge/domain_dictionary.md`](docs/knowledge/domain_dictionary.md) | Ubiquitous language definitions |

---

## Decision Log

| Date | Decision | Context |
|---|---|---|
| 2025-06 | Pre-MVP is an OTT intelligence layer, not an event management platform | We integrate with existing tools instead of building ticketing/registration ops |
| 2025-06 | WhatsApp-first, not WhatsApp-only | Email retained for reporting, exports, organizer workflows |
| 2025-06 | English-only for Pre-MVP | Multilingual deferred to V1 |
| 2025-06 | Phone OTP is MVP identity bootstrap | Long-term identity model may require sophistication |
| 2025-06 | Pre-MVP prototype pivots to structured round-based networking | Fastest path to validate AI + Event Memory hypotheses with a live audience |
| 2026-06 | 7-step build order locked; Auth moved to Step 3 (early, not last) | Avoids retrofitting auth into every endpoint later; see Build Order section above |
| 2026-06 | Brainstorm-before-code rule for every step | Each step opens with a short design/requirements session; Steps 4 & 5 require explicit design alignment before implementation |
| 2026-06 | Pilot attendee auth = attendee's choice of Google sign-in OR Email OTP (via Brevo SMTP), shown as two equal options; phone OTP deferred to MVP | Considered single-method (Google-only) to cut complexity; deliberately chose both so attendees pick what suits them. Phone OTP in India needs DLT registration (weeks) or paid providers. Phone/WhatsApp still collected on the registration form as profile data. |
| 2026-06 | Organizer account created manually in Supabase dashboard with `app_metadata.role = "organizer"`; no signup flow for pilot | One known organizer; building signup UI adds code and attack surface for no benefit |
| 2026-06 | Backend deploys to **Google Cloud Run** (min-instances=1), not Render | Team has GCP credits; Render free tier sleeps after 15 min idle (~50s cold start = event-day risk). Cloud Run stays warm, paid by credits |
| 2026-06 | OTP email via **Gmail SMTP** (app password), not Brevo | Free 500/day; sent from Google's servers so best Gmail inbox delivery for a Gmail-heavy audience |
| 2026-06 | Supabase stays on **free tier** through the pilot | Capacity math: ~70 realtime connections vs 200 limit, tiny DB. Trade-off accepted: must verify project is unpaused the week before the event; no daily backups |
| 2026-06 | Step 6 icebreakers: prefer Claude via **Vertex AI** (GCP credits) — final call at Step 6 | Anthropic SDK has native AnthropicVertex client; credits cover LLM costs |
| 2026-06 | **Step 6 LLM = Claude on Vertex AI, CONFIRMED** (not direct Anthropic API) | Uses existing GCP credits (≈free for pilot) + ADC auth, no `sk-ant-` key to manage. Claude Pro subscription ≠ API access (separate product) — Vertex sidesteps it entirely. Built behind a provider abstraction so direct-Anthropic is a one-line swap if ever needed. `LLM_PROVIDER` env selects vertex/stub/disabled |
| 2026-06 | **Icebreakers async via FastAPI BackgroundTasks, not inline** | Spec forbids blocking the UI on the LLM. Publish returns the round instantly; generation runs after, and each icebreaker INSERT is a Step-5 realtime doorbell so the question appears in `/live` seconds later. Any LLM failure degrades per-person to a curated fallback bank — the room never sees a blank icebreaker. Idempotent (retried publish is a no-op). All prompts centralized in `app/icebreakers/prompts.py`. See `docs/design/icebreakers.md` |
| 2026-06 | **Rotation engine upgraded greedy → re-planning optimizer (simulated annealing)** | Benchmarked greedy against a real optimizer (not naive-random): greedy left up to ~50% more overlap in the mid-size band where real events live, and missed zero-overlap schedules at pilot length. Validated the candidate across 14 shapes (12–1000 people) × stable+churn in `compare_algorithms.py`: re-plan ≥ greedy everywhere, scales to 1000p in seconds. Strategy = plan once / follow / re-plan only on roster change (commit-first MPC was proven *worse* than greedy). Greedy kept as fallback; planner is time-bounded so it can never hang the console. Migration 003 required |
| 2026-06 | **Realtime architecture = "doorbell, not the meal"; recovery is guaranteed (REQ-RT-01)** | Realtime messages are best-effort and can be missed (phone asleep, network loss). Rather than parsing payloads to mutate client state (out-of-order/partial-data bugs), a realtime event is only a *ping to re-fetch*. The phone fetches one authoritative snapshot (`GET /events/:id/live`) on load, reconnect, wake, and every ping — same code path — and must recover within 3 s. Channel structure = one event-scoped channel per phone (≈70 vs ~200 free-tier cap). Countdown derived locally from server `started_at`+`duration`+`server_time` (never streamed). Polling fallback (~10–15 s) covers websockets being blocked entirely. PII never on the wire: `attendees` not published; `round_drafts`/`round_plans` kept out. Announcements / 1:1-match / presence explicitly out of Pre-MVP scope. See `docs/design/realtime.md` |
| 2026-06 | **Deploy Cloud Run in the same region as the Supabase project** | Live validation (`validate_rotation.py`) measured ~700–900ms per organizer action from dev — dominated by network distance + one `auth.get_user` round-trip per request, not the algorithm (sub-ms). Co-location is the main latency lever. Acceptable for organizer console actions regardless; attendees are on Realtime, not this path. If latency ever bites, local JWT verification (vs `get_user`) is the fallback lever — deliberately not done now (reliability over speed) |
| 2026-06-15 | **Attendee flow extended beyond pre-mvp.md: attendee home dashboard + per-event access code** (Step 7) | Spec defined a single shareable event link → register. Product owner chose the industry-standard pattern (Luma/Eventbrite/Partiful): a personal **home** (today / upcoming) AND a working **deep link** to a single event — the deep link stays the reliable in-room mechanic, the dashboard is the product surface. Registration now sits behind a **per-event access code** the organizer announces ("the code is MIXER"). Code is a SECRET in its own service-role-only table (`event_access_codes`, migration 005) — never on the anon-readable `events` row; public API exposes only `requires_code`. Verified case-insensitively server-side on `POST /attendees` (the real gate); `verify-code` is a UX pre-check. Built page-by-page: registration experience first (this change), then the home dashboard |
| 2026-06-15 | **Likes → matches added (one-directional, surfaced as "match" when mutual)** | Attendees ❤️ tablemates live; a mutual like is a *match*. Stored in `connection_likes` with **RLS-on/no-policies = service-role only** (migration 006) — who-liked-whom is never client-readable; it returns only as flags on the liker's own snapshot (`liked`) and rolodex (`liked`/`mutual` + `matches_count`). Idempotent like/unlike, self-like blocked. Consistent with the strict PII posture: no new readable surface, contact info still only in `/connections`. |
| 2026-06-15 | **Profile avatars everywhere (Google photo, initials fallback)** | Capture `user_metadata.avatar_url`/`picture` at registration → `attendees.avatar_url` (migration 006); rendered via a token-driven `Avatar` (photo with `referrerPolicy="no-referrer"` + `onError` → colored-initials fallback) across live tablemates, rolodex, organizer people + control-room grid. Better recognition in the room; degrades gracefully for email-OTP / walk-in attendees with no photo. |
| 2026-06-15 | **Walk-in attendees (organizer adds someone with no account)** | `POST /events/:id/attendees/walkin` (owner-only) creates an attendee with `user_id=null`, `status="arrived"`, seated by the planner like everyone else. Covers the door reality of a live event — people show up unregistered and still need a table. They have no login and won't get a personal rolodex, but they fully participate in rounds. |
| 2026-06-15 | **Theme is pinned per route-segment, not toggled** | Landing stays LIGHT (locked, DESIGN_SYSTEM §1.5); every app surface (`/event/*`, `/organizer/*`, `/home`) is pinned DARK via segment layouts. Components are semantic-token-driven so they render correctly in either theme; routes choose the theme. No user toggle in Pre-MVP — intentional, not a gap. |
| 2026-06-15 | **Avatars are multi-color gradients, from one source** | No-photo avatars render a deterministic two-distinct-color brand gradient (seeded by attendee id) + luminance-correct initials, via the single `lib/design/avatar.ts` helper — replacing a `colorFor` hash that was copy-pasted in 4 files. More vivid + recognizable than a flat tile; identical for the same person everywhere. |
| 2026-06-15 | **Shared-interest tags + private notes (migration 007)** | Attendees pick interest tags at registration (`attendees.interests TEXT[]`); the live tablemate card and rolodex highlight tags you **both** picked as instant conversation openers. Attendees can also jot a private one-line note about anyone they met (`connection_notes`, service-role-only like likes) — surfaced only in their own rolodex. Also surfaced the long-captured-but-never-shown `looking_for`. |
| 2026-06-15 | **Attendee self-service profile editing** | `PATCH /events/:id/attendees/me` (identity from JWT) + a `/event/:id/profile` page let attendees fix contacts / interests after registering — those fields are exactly what the rolodex depends on. Status stays organizer-only. |
| 2026-06-15 | **Organizer day-of + post-event tooling** | QR invite + copyable register link (QR rendered locally — works on flaky venue wifi), client-side CSV export of the roster with contacts, a live "room pulse" (arrived / seated / likes / matches, polled ~12s) in the control room, and an enriched post-event analytics panel (`total_likes`, `total_matches`, % of room met) on the existing `/analytics`. |
| 2026-06-15 | **Join-first hub replaces the event feed** | After sign-in, the attendee hub (`/home`) leads with three actions — **Join via access code**, **Join via QR**, **My connections** — instead of a browsable event list (the list is kept as a "Your events" section below, for re-entry). Rationale: attendees come to a *specific* event with a code/QR the organizer gave them; they shouldn't have to find it in a list. Reverse lookup is `POST /events/join` (code → event); both join buttons and the `/join?code=` deep link share one resolver (`lib/join.ts`), then route to the event's registration → waiting room. |
| 2026-06-15 | **In-app QR scanner (not just native camera)** | "Join via QR" opens an in-app camera scanner (`html5-qrcode`, lazy-loaded, decodes locally — no network, works on venue wifi). The organizer's QR encodes a `/join?code=` deep link, so a *native* camera scan and a shared link work too (the `/join` page signs the user in if needed, then resolves). Belt-and-suspenders: one QR serves the in-app scanner, the phone camera, and a pasteable link. |
| 2026-06-15 | **Organizer-managed access codes (generate / regenerate / remove)** | Codes are now first-class on the organizer dashboard: view, copy, **regenerate** (rotate a leaked code), or remove (make the event open). Generated codes are 6 chars from an unambiguous alphabet (no I/L/O/0/1) and **globally unique** so the code→event reverse lookup is unambiguous. The value is returned only to the owning organizer (`GET /events/:id/access-code`); attendee phones still can never read it (secret table, service-role only). |
| 2026-06-15 | **Cross-event connections (`GET /me/connections`)** | "My connections" aggregates everyone the caller has met across **all** their events into one rolodex, each card tagged with its event. Reuses the per-event connection builder (likes/notes/shared-interests identical). A personal address book that outlives any single event. |
| 2026-06-15 | **Responsive: laptop as a first-class width** | App surfaces were phone-only (`max-w-md`). The hub/rolodex/people now use `max-w-3xl`/`2xl` with `sm:`/`lg:` grids (mobile-first → widen, no logic change). Live table surfaces stay column-centered (a single table is inherently narrow). Verified at 375px and ≥1024px. |
| 2026-06-15 | **HARD RULE — Live screen state comes from the session + server, never the URL** | The attendee identity on `/event/:id/live` is resolved from the Supabase JWT (`GET /attendees/me`), **not** from a `?attendee=` query param. Rationale: (1) security — an attendee id in a shareable URL invites the "can I just change it?" question (answer is no, the backend authorizes by token with `is_self or is_organizer` → 403, but it shouldn't be in the URL at all); (2) privacy — query params leak into browser history, server logs, referrer headers, analytics, and shared screenshots, all of which happen at a live event. **Resume guarantee:** on load / refresh / reconnect / wake the page re-fetches one authoritative snapshot (`GET /events/:id/live`, REQ-RT-01) and reconstructs the attendee mid-round (their current round + table come from the server, not client/URL state) — so a refresh during Round 3 lands back on Round 3, their table, their icebreaker. Only `:eventId` lives in the path (public, anon-readable, standard). Applies to every post-auth attendee redirect (register success, already-registered, AlreadyIn) — they target `/event/:id/live` with no attendee param |
