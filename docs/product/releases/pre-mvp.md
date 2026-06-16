# Pre-MVP Prototype — Build Specification

> This is the complete build spec for the Pre-MVP prototype.
> Read `AGENTS.md` for vision and `PRODUCT.md` for project status before starting.

**Target:** Live pilot event, ~40 attendees, Hyderabad
**Stack:** Next.js + FastAPI + Supabase + Claude API

---

## 1. What Are We Building?

A **mobile-first web application** that helps event organizers run structured, AI-assisted networking at in-person events. Attendees get a personal experience on their phone — they know exactly where to sit each round, and they get smart icebreaker questions tailored to the people at their table.

No app download required. Works in the browser on any smartphone.

---

## 2. The Problem We're Solving

**During the event:**
- People end up talking to the same one or two people they already know
- Introverts struggle to start conversations
- Organizers manually call out names — chaotic, doesn't scale
- People arrive late or leave early and get left out of the rotation

**Structured format attempts today:**
- 4 people per table, swap 2 every 5 minutes
- Same pair always moves together, high repetition, people scramble to wrong tables

**After the event:**
- No record of who you met, where you met them, or why they mattered
- Follow-ups are manual WhatsApp messages with no context

---

## 3. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js (React) | SSR for fast landing pages, file-based routing, Vercel deployment |
| Backend | FastAPI (Python) | Algorithm logic, Claude API integration, auto-generated Swagger docs |
| Database | Supabase (Postgres) | Relational data + Real-time WebSockets + built-in Auth |
| LLM | Claude API (Sonnet) | Personalized icebreaker generation per table |
| Auth | Supabase Auth: Google sign-in OR email OTP for attendees; email/password for organizers | *Amended 2026-06 (see PRODUCT.md Decision Log): phone OTP deferred to MVP — India DLT registration takes weeks. Phone/WhatsApp collected as profile data instead* |
| Frontend Hosting | Vercel | Native Next.js support, instant deployment |
| Backend Hosting | Google Cloud Run | *Amended 2026-06: team GCP credits; min-instances=1 avoids Render free-tier cold starts on event day* |

### Key Technical Constraints
- The app MUST work on mobile browsers without installation
- All real-time updates MUST push to attendee phones automatically — no manual refresh
- The rotation algorithm MUST handle variable attendance (late arrivals, early exits)
- Icebreaker generation MUST NOT block the UI — process asynchronously
- OTP email delivery MUST be tested early — verify codes land in Gmail inboxes, not spam (SMS OTP deferred to MVP)
- Supabase free tier auto-pauses after 7 idle days — verify the project is active the week before the event

---

## 4. Feature Scope

### Attendee Experience
1. **OTP Authentication** — Phone number + Name login via Supabase Auth
2. **Event Landing Page** — Shareable link with event name, date, description, and "Join" CTA
3. **Registration** — Name, Role ("Founder at XYZ"), Looking For ("investors, designers"), LinkedIn/WhatsApp (optional)
4. **Live Dashboard** — Table number, tablemate names/roles, personalized AI icebreaker, synchronized countdown timer
5. **"Generate Another Icebreaker" Button** — Tap to get a fresh AI question for the current table
6. **Round Transition Overlay** — Full-screen "Move to Table X!" animation between rounds
7. **Digital Rolodex (Post-Event)** — "People I Met" list with name, role, and tap-to-WhatsApp across all rounds
8. **End-of-Event Summary** — "You met 24 people across 8 rounds!" with shareable summary

### Organizer Experience
1. **Organizer Login** — Email/password authentication
2. **Event Creation** — Name, date, time, location, description, number of tables, seats per table, default round duration
3. **Live Control Panel** — Mark attendees present/left, Start Round, End Round, End Event
4. **Table Assignment View** — See current round seating layout
5. **Post-Event Analytics** — Total attendees, rounds completed, average unique people met

### Backend & Algorithm
1. **Greedy Rotation Algorithm** — Assigns tables per round, minimizing repeated pairings, handling odd numbers and mid-event attendance changes
2. **AI Icebreaker Engine** — Calls Claude API with all tablemate profiles + "Looking For" intent in a single batch per table
3. **Icebreaker Guardrails** — System prompt enforces professional tone, no personal/emotional topics, fallback questions if API fails

### What Is NOT in the Pre-MVP
- Pre-event intent-based matching
- Per-round feedback collection
- Native iOS/Android apps
- Sponsor or analytics features beyond basic organizer stats
- Ticketing or payments
- Walk-in QR code flows
- Offline fallback

---

## 5. Frontend Pages

### Attendee-Facing

#### `/event/:eventId` — Event Landing Page
- Event name, date, time, location, description
- CTA button: "Join this event"

#### `/event/:eventId/register` — Registration
- Fields: Full name, Role, Looking For, LinkedIn (optional), WhatsApp (optional, pre-filled from OTP)
- On submit: attendee created in database

#### `/event/:eventId/live` — Live Dashboard
- Table number (large, prominent), tablemate names/roles, icebreaker, countdown timer
- Auto-updates via Supabase Realtime when a new round starts
- States: "Event not started yet" → "Round X — go to Table Y" → "Event ended"
- Round transition: full-screen overlay animation

#### `/event/:eventId/connections` — Digital Rolodex
- Shows after event ends
- "You met X people across Y rounds!"
- Everyone they sat with, grouped by round, with tap-to-WhatsApp

### Organizer-Facing

#### `/organizer/login` — Auth
- Email/password login

#### `/organizer/dashboard` — Event Management
- Create event, view list of events

#### `/organizer/event/:eventId/live` — Live Control Panel
- Attendee list with status, Start/End Round buttons, End Event button
- Table assignment grid view
- Post-event: analytics summary

---

## 6. API Endpoints

### Events
- `POST /events` — Create event
- `GET /events/:eventId` — Get event details
- `PATCH /events/:eventId` — Update event status
- `POST /events/:eventId/end` — End entire event, trigger post-event state
- `GET /events/:eventId/attendees` — List all attendees
- `GET /events/:eventId/analytics` — Post-event summary stats

### Attendees
- `POST /events/:eventId/attendees` — Register attendee
- `PATCH /events/:eventId/attendees/:attendeeId` — Update status (arrived/left)
- `GET /events/:eventId/attendees/:attendeeId` — Get attendee + current assignment

### Rounds
- `POST /events/:eventId/rounds/start` — Start new round (triggers algorithm + icebreakers)
- `POST /events/:eventId/rounds/end` — End current round
- `GET /events/:eventId/rounds/current` — Get current round with all assignments

### Tables
- `GET /events/:eventId/rounds/:roundId/tables/:tableNumber` — Get all attendees at a table

### Icebreakers
- `GET /events/:eventId/rounds/:roundId/icebreaker/:attendeeId` — Get icebreaker
- `POST /events/:eventId/rounds/:roundId/icebreaker/:attendeeId/refresh` — Generate new one

### Connections
- `GET /events/:eventId/attendees/:attendeeId/connections` — Digital Rolodex data

---

## 7. Data Models

### Event
```
id, name, date, time, location, description,
num_tables, seats_per_table, default_round_duration_seconds,
organizer_id, status (upcoming / active / ended),
created_at
```

### Attendee
```
id, event_id, user_id, name, role,
looking_for, linkedin_url, whatsapp_number,
status (registered / arrived / left),
created_at
```

### Round
```
id, event_id, round_number,
duration_seconds, started_at, ended_at,
status (active / completed)
```

### TableAssignment
```
id, round_id, event_id,
attendee_id, table_number
```

### Icebreaker
```
id, round_id, table_number,
recipient_attendee_id, target_attendee_id,
question_text, generated_at
```

---

## 8. Real-Time Behavior

Supabase real-time subscriptions push updates so that when the organizer clicks "Start Round", every attendee's phone updates instantly.

- Attendee screen subscribes to: `Round` changes (for their event) and `TableAssignment` changes (for their attendee ID)
- New round starts → transition overlay → new table → new tablemates → new icebreaker

---

## 9. Icebreaker Generation Strategy

To avoid 40 separate Claude API calls per round:

1. Algorithm assigns tables first
2. For each table, make **1 Claude API call** with all tablemate profiles
3. Prompt asks Claude to generate a personalized icebreaker for each person, directed at a specific tablemate
4. Result: ~10 API calls per round (one per table) instead of 40
5. Generation is asynchronous — attendee sees table assignment immediately, icebreaker appears within seconds

**Fallback:** If Claude API is slow or fails, show a curated question from a pre-built bank of professional networking questions.

---

## 10. Pilot Details

- **Event:** Founder Meetup, Hyderabad
- **Expected attendees:** ~40
- **Format:** 4 per table, 5-minute rounds
- **Tables needed:** 10
- **Estimated rounds:** 8–10

---

## 11. Success Criteria

- Every attendee sees their table assignment in real time
- Algorithm produces minimal repeated pairings across 8+ rounds
- Organizer runs the event from one screen
- Icebreakers feel relevant and personal
- Digital Rolodex gives attendees a reason to keep the link
- No crashes during the live event
- Outsiders are impressed by the polish and intelligence
