# Claude Runtime Instructions

## Project Context
You are working on the **Event Networking Platform**.

> **Read these files in order before writing any code:**
> 1. `AGENTS.md` — Vision, philosophy, and what the platform is
> 2. `PRODUCT.md` — Current project status, decision log, and links to all docs
> 3. `docs/product/releases/pre-mvp.md` — **The active build spec** (features, models, endpoints, stack)

## Current Phase
**Pre-MVP Prototype Build.**

We are building a structured networking app for a live pilot event (~40 attendees). The complete feature scope, data models, API endpoints, and tech stack are defined in `docs/product/releases/pre-mvp.md`.

## Rules of Engagement
1. **The build spec is law.** Do not add features not in `pre-mvp.md`. Do not skip features listed there.
2. **Mobile-first always.** Every screen must look great on a phone (375px). Desktop is secondary.
3. **Reliability over cleverness.** If it crashes at the live event, nothing else matters.
4. **Test the happy path obsessively.** Register → Arrive → See Table → Read Icebreaker → Move → Repeat → See Rolodex.

## Tech Stack
- **Frontend:** Next.js (React + TypeScript) → Deploy to Vercel
- **Backend:** FastAPI (Python with type hints) → Deploy to Render
- **Database:** Supabase (Postgres + Realtime + Auth)
- **LLM:** Claude API (Sonnet) for icebreakers

## Code Style & Conventions
- Use TypeScript for all frontend code
- Use Python type hints for all backend code
- Mobile-first CSS (design for 375px width first, then scale up)
- All API responses must follow consistent JSON shape
- Keep components small and focused

## Background Context
This prototype is the first step of a much larger Event Intelligence Platform. Extensive discovery documentation exists in `docs/` covering domain models, persona journeys, feature inventories, and architecture requirements. Consult these if you need business context, but **do not build features from those docs** — only build what is in `pre-mvp.md`.
