# PRODUCT.md — Event Networking Platform

> This document is the single source of truth for anyone building this product — developers, designers, or AI coding assistants. Read this before writing a single line of code.

---

## 1. What Are We Building?

A **mobile-first web application** that helps event organizers run structured, AI-assisted networking at in-person events. Attendees get a personal experience on their phone — they know exactly where to sit each round, and they get smart icebreaker questions tailored to the people at their table.

No app download required. Works in the browser on any smartphone.

---

## 2. The Problem We're Solving

Networking at in-person events is broken in three ways:

**During the event:**
- People end up talking to the same one or two people they already know
- Introverts struggle to start conversations
- Organizers manually call out names or move people around — it's chaotic and doesn't scale
- People arrive late or leave early and get left out of the rotation

**At the event (structured format attempt):**
- Current workaround: 4 people per table, swap 2 people every 5 minutes
- Problems: the same pair always moves together, repetition is high, people scramble to wrong tables, no system to handle dynamic attendance

**After the event:**
- No record of who you met, where you met them, or why they mattered
- Follow-ups are manual WhatsApp messages with no context layer

---

## 3. Who Is This For?

**Primary user: Event Organizer**
- Hosts recurring in-person events: founder meetups, tech community events, creator gatherings
- Event size: 30 to 300 people (MVP target: ~40 people)
- Currently based in India (Hyderabad-first pilot)
- Pain: managing structured networking manually is hard, doesn't scale, and produces inconsistent results

**Secondary user: Event Attendee**
- Professionals, founders, students, creators attending community events
- Uses the platform on their phone during the event
- Pain: meets too few people, doesn't know how to start conversations, loses context of who they met

**Business model:**
- Organizers pay per event to use the platform (B2B)
- Attendees use it for free
- Post-MVP: attendees may pay a monthly fee to maintain their cross-event connection graph

---

## 4. MVP Scope (Target: June 27, 2025 Pilot)

### What's IN the MVP

1. **Event landing page** — shareable link per event with event name, date, description
2. **Attendee sign-up flow** — name, what they do, who they're looking to meet (2–3 fields max)
3. **Rotation algorithm** — assigns every attendee to a table each round, maximizing unique pairings
4. **Personal round notifications** — each attendee's phone shows their table number for the current round
5. **AI icebreaker engine** — at the start of each round, each person at the table gets a targeted question directed at a specific tablemate
6. **Organizer dashboard** — start/stop rounds, view current table assignments, handle late joiners and early exits

### What's NOT in the MVP (post-MVP backlog)

- Post-event connection memory
- Pre-event intent-based matching (feeding into the algorithm)
- Cross-event attendee profiles
- Per-round feedback collection
- Hackathon team formation mode
- Mobile app (native iOS/Android)
- Sponsor or analytics features

---

## 5. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React (Vite) | Fast, component-based, mobile-friendly |
| Backend | FastAPI (Python) | Fast to build, async-ready, auto API docs |
| Database | Supabase (Postgres) | Real-time subscriptions built-in — needed for live round updates |
| LLM (Icebreakers) | Claude API (claude-sonnet-4-20250514) | Generates personalized icebreaker questions per table |
| Hosting | TBD (Vercel for frontend, Railway or Render for backend) | Fast deployment, free tier available |

**Key constraint:** The app must work on mobile browsers without any installation. All real-time updates (round starts, table assignments) must push to the attendee's phone automatically — no manual refresh.

---

## 6. Frontend Pages & Components

### 6.1 Attendee-Facing Pages

#### `/event/:eventId` — Event Landing Page
- Shows event name, date, time, location, brief description
- CTA button: "Join this event"
- If registration is already open, leads directly to sign-up

#### `/event/:eventId/register` — Attendee Registration
- Form fields:
  - Full name
  - What do you do? (one line — e.g. "Founder at XYZ", "Software Engineer at ABC")
  - Who are you hoping to meet? (one line — e.g. "investors", "designers", "other founders")
- On submit: attendee is created in the database and receives a unique attendee link

#### `/event/:eventId/attend/:attendeeId` — Attendee Live View (Main Screen)
- This is the screen attendees keep open during the event
- Shows:
  - Current round number
  - **Their assigned table number** (large, prominent)
  - Names + one-liner of the other 3 people at their table this round
  - **Their personal icebreaker question** for this round
- Auto-updates in real time when a new round starts (no refresh needed)
- Status states: "Event not started yet", "Round X in progress — go to Table Y", "Event ended"

### 6.2 Organizer-Facing Pages

#### `/organizer/login` — Organizer Auth
- Simple email/password login
- No social login needed for MVP

#### `/organizer/dashboard` — Event Management
- Create a new event (name, date, time, location, description, number of tables, seats per table)
- View list of created events

#### `/organizer/event/:eventId/live` — Live Event Control Panel
- See all registered attendees and their status (present / left early)
- Mark attendees as "arrived" or "left"
- Add a walk-in attendee on the spot
- Current round number and timer
- Buttons: "Start Round", "End Round", "Next Round"
- Table view: see who is sitting where in the current round
- Override: manually reassign an attendee to a different table if needed

---

## 7. Backend API Endpoints

### Events
- `POST /events` — create a new event
- `GET /events/:eventId` — get event details
- `GET /events/:eventId/attendees` — list all attendees

### Attendees
- `POST /events/:eventId/attendees` — register a new attendee
- `PATCH /events/:eventId/attendees/:attendeeId` — update status (arrived, left)
- `GET /events/:eventId/attendees/:attendeeId` — get individual attendee + current assignment

### Rounds
- `POST /events/:eventId/rounds/start` — start a new round (triggers algorithm, pushes assignments)
- `POST /events/:eventId/rounds/end` — end current round
- `GET /events/:eventId/rounds/current` — get current round assignments

### Icebreakers
- `GET /events/:eventId/rounds/:roundId/icebreaker/:attendeeId` — get this attendee's icebreaker question for this round

---

## 8. Data Models

### Event
```
id, name, date, time, location, description,
num_tables, seats_per_table, organizer_id,
status (upcoming / active / ended),
created_at
```

### Attendee
```
id, event_id, name, role (what they do),
looking_for (who they want to meet),
status (registered / arrived / left),
unique_link_token,
created_at
```

### Round
```
id, event_id, round_number,
started_at, ended_at,
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
question_text,
generated_at
```

---

## 9. Real-Time Behavior

Supabase real-time subscriptions are used so that when the organizer clicks "Start Round", every attendee's phone updates instantly without them refreshing.

- Attendee screen subscribes to: changes on `Round` (for their event) and `TableAssignment` (for their attendee ID)
- When a new round starts, the attendee screen re-renders with the new table number and new icebreaker question automatically

---

## 10. First Pilot Details

- **Event:** Founder Meetup, Hyderabad
- **Date:** June 27, 2025
- **Expected attendees:** ~40 people
- **Format:** 4 people per table, 5-minute rounds
- **Number of tables needed:** 10 tables
- **Estimated rounds:** 8–10 rounds

---

## 11. Success Criteria for Pilot

- Every attendee can open their link on their phone and see their table assignment
- Algorithm produces zero repeated pairings for at least the first 6 rounds
- Organizer can run the entire event from one screen without calling out any names
- Icebreaker questions feel relevant and personal (not generic)
- No crashes or loading failures during the live event

---

## 12. Product Name Ideas

A few directions worth considering:

- **Orbits** — people move around each other, every round is a new orbit
- **Roundly** — clean, describes the round-based format, easy to say
- **Tablemate** — literal, friendly, immediately understood
- **Circl** — short for circle/circulation, modern spelling
- **Mixr** — mixing people together, simple
- **Nestly** — nesting connections at events

No name is final. Pick what feels right for the founder meetup audience.
