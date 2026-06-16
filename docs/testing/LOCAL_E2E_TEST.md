# Local End-to-End Test — Organizer → Attendee → Recap

A hands-on script for testing the whole platform **solo, on localhost**, before
showing it to anyone. No deploy, no tunnel, and only **one Gmail inbox** required.

> Goal: walk the full happy path — create an event, fill the room, run rounds with
> live seating + themed icebreakers, like people, and see the recap — while
> watching for the bugs that usually bite a live event.

---

## 0. Two tricks that make solo testing easy

1. **Gmail plus-aliases = many real accounts, one inbox.** Supabase treats
   `youraddr+a@gmail.com`, `youraddr+b@gmail.com`, `youraddr+c@gmail.com` as
   *distinct users*, but every email-OTP code lands in **your single inbox**. So
   you can be 3–4 logged-in attendees with one mailbox.
2. **Walk-ins need no email.** The organizer **People** screen has an
   **"Add walk-in"** button — it creates an *arrived* attendee with no account.
   Use these to **fill the room** so seating/rotation is meaningful. (You can't
   *log in as* a walk-in — they have no phone view — they just populate tables.)

**Recommended cast for an 8-person test:** 3 plus-alias attendees you actually log
in as (to watch the live phone view) **+ 5 walk-ins** to fill the room.

---

## 1. One-time setup

1. **Run migration 012** in the Supabase SQL editor (adds the round-agenda column),
   or the Round-agenda settings will error:
   ```
   supabase/migrations/012_round_agenda.sql
   ```
2. Make sure earlier migrations (006–011) are already run (they are, per the
   project status).

---

## 2. Start the app (two terminals)

```bash
# Terminal 1 — backend
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload        # http://localhost:8000   (Swagger at /docs)

# Terminal 2 — frontend
cd frontend
npm run dev                          # http://localhost:3000
```

**For independent logins at the same time**, use a different browser *profile* per
person (each has its own session). Example:

| Role        | Browser                |
|-------------|------------------------|
| Organizer   | Chrome (normal)        |
| Attendee A  | Chrome Incognito       |
| Attendee B  | Microsoft Edge         |
| Attendee C  | Firefox                |

> Separate Incognito *windows* in the same session share cookies — use different
> browsers/profiles instead, or you'll keep logging the same person in.

---

## 3. Organizer: create and configure the event

Do this in the **organizer** browser.

1. Sign in as the organizer and open the **Dashboard**.
2. **Create event** with small numbers so a few people fill it:
   - **Tables: 2**, **Seats per table: 4** (room holds 8)
   - **Planned rounds: 3**
   - **Round length: 1–2 min** (so you're not waiting around while testing)
   - Set an **access code**, e.g. `MIXER`
3. Open the event → **Settings → Round agenda** and name the rounds — this is the
   **Phase 6** feature:
   - Round 1: `Origins`
   - Round 2: `What you're building`
   - Round 3: `Bold opinions`
   - **Save changes.**
4. Open the event → **People → Add walk-in** and add ~5 people (any names). They
   appear as **arrived** and will be seated like everyone else.

---

## 4. Attendees: join and register

Do this in each **attendee** browser (A, B, C).

1. Go to `http://localhost:3000`.
2. **Sign in → Email OTP**, using `youraddr+a@gmail.com` (then `+b`, `+c` in the
   other browsers). Grab the 6-digit code from your Gmail inbox.
3. Enter the **access code** `MIXER`.
4. Fill the **registration** form (name, role, company, what you're looking for,
   a couple of interests). Submit.
5. You land in the **waiting room**. ✅ **Check Phase 6 surface #1:** the
   **"Tonight"** card lists your agenda names (Origins / What you're building / …).
6. *(Optional, exercises intent-aware seating)* Open the **directory** ("See who's
   coming") and **pick 1–2 people to meet**. If two people pick each other, that's
   a mutual intent the seating engine will try to honor.

---

## 5. Organizer: run the rounds

Back in the **organizer** browser, open the event **Command Center**.

1. **Start round** → review the draft seating → **Publish**.
   - Watch the attendee windows: within a few seconds they should flip from the
     waiting room to their **table + boarding pass** (this is the realtime
     "doorbell"). ✅ **Phase 6 surface #2:** the boarding pass shows the round's
     **theme name** (Origins), not just "Round 1".
   - If anyone picked someone who's now at their table, they'll see a
     **"someone you wanted to meet is here"** nudge.
2. In an attendee window, **like** a tablemate (❤️). If you like each other across
   two windows, confirm it reads as a **match**.
3. When the timer ends (or end it manually), **Start round 2 → Publish**.
   - Confirm attendees get **new tablemates** (novelty) and round 2's theme
     ("What you're building").
4. Run **round 3** the same way.
5. **End event.**

---

## 6. Recap

In each attendee browser, open the **recap** ("See your recap").
- Confirm it shows the people they met and any matches.

---

## 7. Note on icebreaker theming (important)

The **agenda names** show everywhere immediately (waiting room + boarding pass) —
that's pure frontend from `round_topics`.

But the **icebreaker text actually changing to match the theme** only happens with
a **real LLM (Vertex AI)**. On localhost without Vertex, the app falls back to the
curated question bank, which is **deliberately theme-agnostic** (a safety default).
So the icebreaker *wording* won't reflect the theme until you set
`LLM_PROVIDER=vertex` + a GCP project in `backend/.env`. The prompt-threading is
tested and correct — it just needs a live model to be *visible*.

---

## 8. Bug-hunting checklist

Where these apps usually break — try each:

- [ ] **Realtime lag** — does the attendee screen update within a few seconds of
      Publish, or only after a manual refresh?
- [ ] **Late arrival** — register a new attendee *after* round 1 started. Do they
      get seated next round without breaking the plan?
- [ ] **Walk-in mid-event** — add a walk-in during round 1. Does round 2 re-plan
      to include them?
- [ ] **Refresh recovery** — hard-refresh an attendee mid-round. Is the same table
      restored? (No "lost my screen" moment.)
- [ ] **Access code** — wrong code rejected; correct code accepted in any case
      (`mixer` == `MIXER`).
- [ ] **Mobile width** — resize a browser to ~375px. Is every screen still clean?
- [ ] **Odd shapes** — an odd headcount, or one person alone at a table. No crash,
      sensible seating, no self-icebreaker.
- [ ] **Empty agenda** — an event with no round names set still shows sensible
      default names (Origins, …) and runs fine.
- [ ] **Speakers/hosts** — tag someone as speaker/host in People; confirm they
      appear as a **guest, not seated** in the rounds.

---

## 9. Quick reference

| Thing | Where |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API + Swagger | http://localhost:8000/docs |
| Organizer console | http://localhost:3000/organizer/dashboard |
| Attendee join | http://localhost:3000 → Sign in → access code |
| Add walk-ins / tags | Organizer → event → **People** |
| Round agenda (Phase 6) | Organizer → event → **Settings → Round agenda** |
| Run rounds | Organizer → event → **Command Center** |

> Tip: keep `http://localhost:8000/docs` open — if a screen misbehaves, you can
> inspect the exact API response there to tell a frontend bug from a backend one.
