# Event Networking Platform

> This is the root context file. Every AI agent reads this first.
> For the current build spec, see `PRODUCT.md`.

---

## What We Are Building

An intelligent event networking platform that helps organizers run structured, AI-assisted networking at in-person events. Attendees get a personalized experience on their phone — they know exactly where to sit each round, and they get smart icebreaker questions tailored to the people at their table.

No app download required. Works in the browser on any smartphone.

---

## Mission

Transform events from isolated experiences into long-term relationship, knowledge, and business growth systems.

The event should not end when attendees leave the venue.

---

## Current Phase

**Phase: Pre-MVP Prototype Build**

We are building a working prototype for a live pilot event (~40 attendees).

The detailed feature scope, data models, API endpoints, and tech stack are defined in:
→ **`PRODUCT.md`** (read this before writing any code)

---

## Core Personas

### Event Organizer (Primary — Pays for the Platform)
* Hosts recurring in-person events (founder meetups, tech communities)
* Event size: 30–300 people
* Pain: managing structured networking manually is hard and inconsistent

### Event Attendee (Secondary — Uses for Free)
* Professionals, founders, students, creators
* Uses the platform on their phone during the event
* Pain: meets too few people, can't start conversations, loses context afterward

---

## Product Philosophy

* **Reliability over features.** If it crashes at the live event, nothing else matters.
* **Mobile-first always.** Every screen must look great on a phone.
* **Optimize for outcomes, not features.** Every feature must solve a real problem.
* **The AI must feel magical, not generic.** Icebreakers must reference specific people, roles, and intent.
* **Keep it simple.** Do not over-engineer. Do not add features not in PRODUCT.md.

---

## Flow Guardian Agent

Before non-trivial implementation work, use `.agents/flow-guardian.md` as the vendor-neutral change-safety agent. It checks whether a user's request or developer-planned change alters existing app flows, expands scope, increases load/cost, or changes privacy/reliability boundaries. If it finds a meaningful behavior, cost, or risk tradeoff, ask the user for confirmation before coding.

---

## Strategic Direction

This prototype validates the core of a larger Event Intelligence Platform.

Future capabilities (post-prototype) include:
* Cross-event memory (connections follow you to every event)
* AI matchmaking based on professional intent
* Exhibitor lead intelligence
* Sponsor ROI dashboards
* WhatsApp-first workflows
* Enterprise and trade show support

---

## Definition of Success

The platform succeeds when:
* Organizers can run a networking event entirely from one screen
* Attendees meet 20+ unique people per event
* AI icebreakers make conversations start faster
* Attendees leave with a digital record of everyone they met
* Outsiders who see the product want to use it for their own events

---

## Reusable Guardrail Agent

Before implementing any change that may affect existing product flows, live-event
reliability, privacy/security boundaries, infrastructure load, or LLM/API cost,
run the vendor-neutral **Flow Sentinel** agent:

→ `.agents/flow-sentinel/AGENT.md`

Flow Sentinel works across Codex, Claude, Gemini, Cursor, and other LLM tools. It
checks whether the user's prompt or developer request changes the current app
flow, expands scope beyond `PRODUCT.md`, increases unwanted load/cost, or weakens
security and reliability. If the risk is material, it must ask the user for
confirmation before implementation.
