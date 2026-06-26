# Launch Prep — Change Plan

> Pre-launch cleanup pass before going live (target: launch tomorrow).
> Owner: Harshith. Compiled from a full review of the codebase + product docs.
> This is the source of truth for *what* we change and *why*. Implementation
> happens after sign-off, top to bottom by priority.

**Legend** — Effort: S (≤30 min) · M (~1–2 h) · L (half day+). Risk: 🟢 cosmetic/copy · 🟡 flow change · 🔴 algorithm/data.

---

## Decisions locked (from kickoff Q&A)

1. **Book-a-demo** → store every lead in a new Supabase `demo_requests` table **and** email `harshithtunuguntla@gmail.com` on submit.
2. **Profile model** → **one global profile per user**, captured **once at first login**. It is the single source of truth and stays consistent across events. On each event join we show the **prefilled** profile so they can correct anything; edits update the **global** profile (not a per-event copy). No per-event profile divergence for now.
3. **Data ops** → I execute them via script using the local service-role key (delete the old events, create the organizer login), showing the exact event list for confirmation before any delete.
4. **Visual assets** → I capture **live screens + animations** from the running app (the round timer, the table "showing up", icebreaker reveal, rolodex) and use those in the Experience section. No stock/placeholder art.

---

## ⚠️ Key validation finding — the run sheet (your item 7)

You were right to flag it, and here's the precise picture:

- **The LIVE event engine is safe — it does NOT reset.** When you publish rounds during the event, each round is written to `table_assignments` and is **immutable**. The planner reads the *real* pairing history (`_pair_counts`) and only re-plans the **remaining** rounds. Add a person mid-event and rounds already played stay byte-for-byte identical. (`_seating_for_next_round`, `backend/app/routers/rounds.py`.)
- **The run-sheet PAGE is the bug.** [`get_run_sheet`](../../backend/app/routers/rounds.py) always calls `plan_rounds(ids, {}, …)` — **clean slate, no history, full plan from round 1, over whoever is in the pool *right now***. So it is a "what if everyone currently here played every round" projection, not a record of what happened. Add one person and the entire sheet (past rounds included) regenerates. **That is exactly the behaviour you saw.** The algorithm is not resetting the event — only this read-only preview rebuilds itself.

**Fix direction (detailed in P0-6):** anchor the sheet to already-**published** rounds (read real `table_assignments` for completed/active rounds → frozen) and only **project** the not-yet-played rounds via the planner seeded with real history. Past rounds never change; future rounds adapt to new people without resetting or overlapping.

---

# P0 — Launch blockers (correctness, core flow, the public face)

### P0-1 · Data ops: clean up events + add organizer account — Effort S · Risk 🔴
*Add-ons 2 & 3.*
- **Add organizer:** create the harshithtunuguntla@gmail.com login (password shared separately, not recorded here) with `app_metadata.role = "organizer"` (mirrors the existing manual-organizer pattern; reuse `backend/scripts/tag_organizer.py` + `reset_organizer_password.py` or a new `create_organizer.py`).
- **Delete old events:** the events currently visible can't be archived from the UI. I'll list every event (id, name, date, status, attendee count) for your confirmation, then hard-delete the agreed set + their child rows (attendees, rounds, assignments, drafts, plans, icebreakers, intents, likes, notes, codes).
- **Decision to make:** do we *also* want an **archive/delete button in the organizer dashboard** so you never need a script again? (Recommended as a small follow-up — see P2-7.) For tomorrow, the script clears the slate.

### P0-2 · First-login global profile, then prefilled join — Effort L · Risk 🟡
*Items 1 & 2.* Today, after sign-in a new user lands on `/home` (event hub) with no profile capture; profile fields live on the per-event `attendees` row.
- **New flow:** first sign-in → **profile setup screen** (name, what they do/role, company, short description, website, LinkedIn, interests, avatar) → save → **then** land in the platform (`/home`: events, join code, connections).
- **Global store:** persist to the user's **global profile** (extend the profile-draft system added in `d4d3599`; confirm/define the backing table, e.g. `user_profiles` keyed by `user_id`). This becomes the source of truth.
- **Per-event join:** joining any event shows the **prefilled** profile page → "Save & join". Edits write back to the **global** profile; the event's `attendees` row is created/synced from it (status, tag, table assignments stay per-event).
- **Gate:** a lightweight "profile complete?" check redirects to setup until the core fields exist; returning users skip straight through.
- **Open item:** confirm the exact global-profile table/columns from the `d4d3599` work before coding (I'll verify on implementation).

### P0-3 · Waiting-room screen: lead with "who's coming", demote the code — Effort M · Risk 🟢
*Item 3.* After someone joins and is waiting for check-in, the current screen highlights "enter check-in code" while burying "people coming" — confusing right after they just entered a code.
- **Flip the hierarchy:** **highlight** = "Who's coming" — show a few names/avatars + "See everyone" (links to the event directory). **Secondary/bottom** = a calm line like *"Enter the check-in code during the event when your host reads it out."*
- Files: the attendee waiting state in `components/live/live-screens.tsx` (+ directory link already exists at `/event/:id/directory`).

### P0-4 · Profile-menu "My connections" must always be global — Effort S · Risk 🟢
*Item 6.* Confirmed bug: the account menu's **My connections** is hardcoded to the **event-scoped** rolodex on two surfaces:
- [`components/live/live-screens.tsx:235`](../../frontend/src/components/live/live-screens.tsx) → `connectionsHref={`/event/${eventId}/connections`}`
- [`app/event/[eventId]/directory/page.tsx:210`](../../frontend/src/app/event/[eventId]/directory/page.tsx) → same.
- **Fix:** point both to `/me/connections` (the global rolodex), matching `/home` and `/me/connections`. The profile menu always means "all my connections, everywhere." (The per-event rolodex stays reachable from the event/recap screens themselves.)

### P0-5 · Home page cleanup (the public site) — Effort L · Risk 🟡
*Home items 1–8.* All copy/data lives in `frontend/src/lib/content/landing.ts`; sections compose in `frontend/src/app/page.tsx`.

| # | Change | Where |
|---|--------|-------|
| 1 | **Remove the top nav** ("How it works / Experience / The night"). | `components/landing/landing-nav.tsx` + `page.tsx` |
| 2 | **Replace "Host an event" CTA** with **"Book a demo"** (opens the in-app form, P0-8) and keep a **"See it live"** demo CTA. | `hero.tsx`, `ROUTES` in `landing.ts` |
| 3 | **"0+ connections made last month" → "50+"** (currently dummy `proofCount: 12400`; set to a real, honest `50`). | `HERO.proofCount/proofSuffix` in `landing.ts` |
| 4 | **Remove the logo marquee** (Y Combinator, a16z, …) — not ours yet. | `LogoStrip`/`logo-strip.tsx` + `LOGOS` |
| 5 | **Rebuild the Experience section with real app captures** (live timer, table reveal, icebreaker, rolodex). | `scenes.tsx`/`scenes-gallery.tsx` |
| 6 | **Remove the "/90 minutes" timeline section** entirely. | `Timeline`/`timeline.tsx` + `TIMELINE` |
| 7 | **Turn the orange final-CTA box into the Book-a-demo form** (collects details; every "Book a demo" button on the site scrolls/links here). | `final-cta.tsx` + P0-8 |
| 8 | **Footer:** drop Manifesto/Hosts/Changelog/Twitter; add **Instagram → instagram.com/peopld.in**. | `FOOTER_LINKS` in `landing.ts`, `site-footer.tsx` |

### P0-6 · Run sheet — make it reflect reality, not regenerate — Effort L · Risk 🔴
*Items 7 & 8.* Per the validation above.
- **Anchor to published rounds:** read actual `table_assignments` for every completed/active round → those rounds are **frozen** in the sheet, exactly as played.
- **Project only the future:** call `plan_rounds(...)` seeded with the **real pairing history** for the *remaining* rounds only — so adding a person changes **future** seating, never the past, and never overlaps people who already met (history is honored).
- **Before any round is published** (pre-event): keep today's whole-event projection as the "insurance" backup, clearly labelled as a projection.
- **UI uplift (item 8):** restyle the sheet to match our app's design system (it's currently a bare white print doc). Per attendee, show **where they sat in each past round** and **where they're seated in upcoming rounds**, consistently. Keep the print/PDF + CSV fallback. Adding new people may change *future* rows (expected) but must visibly never alter past rows.
- Files: `backend/app/routers/rounds.py` (`get_run_sheet`), `frontend/.../run-sheet/page.tsx`.

### P0-7 · LinkedIn / website URL consistency — Effort M · Risk 🟢
*Item 5.* Forms disagree: some demand `https://`, some accept bare `linkedin.com/...`.
- **Standardize one helper** (`lib/...normalizeUrl`/`normalizeLinkedin`): accept what the user types (with/without scheme, with/without `www`), **normalize on save** (prepend `https://`, canonicalize LinkedIn), validate gently, store canonical.
- Apply everywhere the fields appear: profile setup (P0-2), per-event prefill, and **organizer "add people"** (`4b7d975`). Same placeholder + helper text across all.

### P0-8 · Book-a-demo form (form + storage + notify) — Effort M · Risk 🟡
*Cleanup item 3, Home items 2 & 7.*
- **Frontend:** an in-app form (modal or the final-CTA box) — name, email, company, event type/size, message. Client validation, success state, no external redirect.
- **Backend:** `POST /demo-requests` → insert into new `demo_requests` table **and** fire an email to `harshithtunuguntla@gmail.com` via the existing Gmail SMTP (async, never blocks the response; email failure still stores the row).
- **Wiring:** every "Book a demo" button on the marketing site targets this. Organizer login endpoint stays unchanged (we keep hosting events ourselves for now).

### P0-9 · Event directory available all event long — Effort S · Risk 🟢
*New ask.* Today the "See who's coming" directory link only appears in the **lobby** phases (waiting room, check-in, not-seated). Once a round starts (`RoundView`) and between rounds, there's **no way to browse the full guest list** — yet that's exactly when people want to look someone up.
- **Best placement (recommended):** a **persistent "People" / directory icon button in the `LiveShell` top bar** (next to refresh + the account menu). Every live phase is already wrapped in `LiveShell` with `eventId`, so one addition makes the directory reachable from **every** screen — waiting, mid-round, between rounds — consistently, without cluttering the table view.
- Keep the existing in-lobby `DirectoryLink` card too (it's a nice big affordance while waiting); the top-bar icon is the always-on entry. Links to `/event/:id/directory`.

### P0-10 · LinkedIn + website on the table, deep-linked — Effort M · Risk 🟡
*New ask.* While seated, you can't see tablemates' LinkedIn/website — you only get name, role, company, interests. People want to open a profile right there.
- **UI:** add **small icon buttons** (LinkedIn logo + a globe/website icon) to each `TablemateRow` — compact, sitting near the name/role, **not** big buttons. Only render an icon when that link exists. Same treatment on the "people you just met" list (BetweenRounds) and ideally the directory cards.
- **Data (backend):** `Tablemate` doesn't carry these yet. Add `linkedin_url` + `website` to the `Tablemate` model + `_make_tablemate` (both the active-seat and recent-seat build paths in `routers/live.py`), and to the frontend `Tablemate` interface. They flow through the **authorized REST snapshot** (`GET /events/:id/live`), not the realtime publication — consistent with our PII posture (attendees table is never published over realtime). Surfacing professional links at the table is a deliberate product choice and the right contact channel for this audience.
- **Deep-linking (open the app, not the browser):** the robust mechanism is **universal links** — link to the canonical `https://www.linkedin.com/in/<handle>` and the OS routes it to the LinkedIn app automatically when installed (a raw `linkedin://` scheme needs a member URN, not the vanity URL, so it's unreliable as a primary). We can additionally *attempt* `linkedin://` with an `https` fallback for best effort. Website links open normally (no app concept). This depends on **P0-7** (URL normalization) so stored links are always canonical `https` — the two should ship together.
- **Privacy note:** these links are already public-professional and shown only to authorized attendees in the room; no phone/email is exposed. Aligns with the strict-PII decisions.

---

# P1 — Consistency & polish (cheap, high-visibility)

### P1-1 · Logo consistency → single "p" mark — Effort S · Risk 🟢
*Item 9.* Today `Logo` renders a "p" tile **with a coral dot**; other surfaces use the `Wordmark`, and some show just "p". Pick **one** canonical mark (recommend: the clean **"p" letter**, dot dropped, per your note) and use it everywhere — nav, 404, app headers, account menu. Files: `components/brand/logo.tsx`, `wordmark.tsx`, all usages.

### P1-2 · 404 page — one button, "go back" — Effort S · Risk 🟢
*Item 4.* Replace the two buttons (Go to my events / Back home) in `app/not-found.tsx` with a **single** "Go back" action that returns to the **previous page** (`router.back()`), with a sensible fallback (`/home`) if there's no history.

### P1-3 · Drop "night" everywhere → neutral event language — Effort M · Risk 🟢
*Cleanup item 1.* "Night" is sprinkled across copy (8 files incl. `landing.ts` hero subcopy "orchestrate the night", `scenes.tsx`, settings, recap, analytics). Not all events are at night.
- **Recommendation:** standardize on **"your event"** / **"the room"** / **"the session"** by context (e.g. hero: "…orchestrate the room"; recap: "your event"). One pass, replace each occurrence with the contextually natural neutral term. I'll list exact before/after strings at implementation time for your quick approval.

### P1-4 · Round naming → plain numbers by default — Effort S · Risk 🟢
*Cleanup item 2.* Rounds are random shuffles, so themed default names ("Origins", "What you're building", "Help wanted") mislead.
- **Recommendation:** default round labels become **"Round 1 / Round 2 / …"** (keep the signature per-round **color** identity). Organizers can still name a round via the existing agenda field (`event.round_topics`) when they actually want a theme — but the default is honest and generic.
- Files: `lib/design/rounds.ts` (`ROUNDS` names → "Round N", `defaultRoundName`), and the marketing `TIMELINE` copy in `landing.ts`.

---

# P2 — Add-ons & nice-to-haves (post-core, if time permits)

### P2-1 · Subtle post-event feedback / testimonial — Effort M · Risk 🟡
*Add-on 1.* Goal: feels offered, not forced.
- **Recommendation:** once an event wraps, on the **recap / connections** screen show a single calm card — *"How was tonight? (30 seconds)"* — with a 1–5 rating + one optional free-text line. Dismissable, never a blocking modal, shown once. Store in a `event_feedback` table (event_id, attendee_id, rating, comment). Optionally surface aggregate to the organizer analytics later.
- This doubles as launch testimonials (with consent).

### P2-2 · Real event photos on the site — Effort S · Risk 🟢
*Cleanup item 4.* **Recommendation:** yes, a small, tasteful strip of real past-event photos builds trust for a launch — but only if they look good. Since you'll provide none for now, the **live app captures** (P0-5 #5) carry the Experience section; we can add a real-photo strip later when you have shots you like. Not a launch blocker.

### P2-3 · Organizer archive/delete events from UI — Effort M · Risk 🟡
*Follow-up to P0-1.* Add an archive (soft) + delete (hard, confirm) action to the organizer dashboard so you never need a script again. Recommended right after launch.

---

## Suggested build order

1. **P0-1** (data ops — unblocks you testing with a clean slate + your own login). *I can run this as soon as you confirm the event list.*
2. **P0-5 + P0-8 + P1-1/P1-2 + P1-3/P1-4** (the public site + cheap consistency — the face of tomorrow's launch).
3. **P0-2** (first-login global profile + prefilled join — core onboarding).
4. **P0-3, P0-4, P0-7** (waiting room, connections bug, URL consistency).
5. **P0-9 + P0-10** (always-on directory + tablemate LinkedIn/website links — ship P0-10 with P0-7 since it needs canonical URLs).
6. **P0-6** (run-sheet correctness + UI — organizer-facing, can trail the public launch slightly if needed).
6. **P2** add-ons as time allows.

## Open questions before coding
- **P0-2:** confirm the global-profile table/columns from the `d4d3599` profile-draft work (I'll verify in code, flag if a migration is needed).
- **P1-3:** quick approval of the exact "night" → neutral wording swaps (I'll present the list).
- **P0-1:** the explicit list of events to delete (I'll show all events first).
