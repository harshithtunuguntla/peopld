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
| **Progress** | Steps 1–2 complete (scaffold + backend CRUD, tested live). Next: Step 3 (Auth) |
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
| 4 | **Rotation Algorithm** — ⚠️ design session FIRST (greedy: minimize repeat pairings, handle late arrivals/early exits), then implement `backend/app/algorithm.py` behind `POST /rounds/start` | Pending |
| 5 | **Supabase Realtime** — ⚠️ agree on channel structure FIRST (frontend + backend must align); attendee screens subscribe to Round + TableAssignment changes | Pending |
| 6 | **Claude Icebreaker Engine** — 1 API call per table per round (batch), async, curated-question fallback if Claude fails; model configurable via `ANTHROPIC_MODEL` env var | Pending |
| 7 | **Next.js Frontend** — all 7 pages (4 attendee + 3 organizer), mobile-first 375px; UI design + error states decided just-in-time per page | Pending |

---

## Where to Find Everything

### 🔨 What We're Building Right Now
| Document | Purpose |
|---|---|
| [`docs/product/releases/pre-mvp.md`](docs/product/releases/pre-mvp.md) | **START HERE.** Complete build spec: features, data models, endpoints, tech stack |
| [`GETTING_STARTED.md`](GETTING_STARTED.md) | Dev onboarding: fresh-clone setup, env files, tests, and how auth works |

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
