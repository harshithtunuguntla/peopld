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
| **Progress** | Not started — planning complete |

---

## Where to Find Everything

### 🔨 What We're Building Right Now
| Document | Purpose |
|---|---|
| [`docs/product/releases/pre-mvp.md`](docs/product/releases/pre-mvp.md) | **START HERE.** Complete build spec: features, data models, endpoints, tech stack |

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
