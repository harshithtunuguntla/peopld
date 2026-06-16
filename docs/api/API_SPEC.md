# API Spec — Peopld

> A living reference of the APIs the frontend actually uses. **Grows as we wire
> each page** — an endpoint lands here the moment a screen integrates it, not
> before. If you're new: this is the contract; the source of truth for shapes is
> `backend/app/models/schemas.py`.

**Conventions**

- **Base URL:** `process.env.NEXT_PUBLIC_API_URL` (dev: `http://localhost:8000`).
- **Auth:** Supabase issues the session JWT. The frontend's `apiFetch` attaches
  it as `Authorization: Bearer <token>` automatically when signed in.
- **Errors:** non-2xx return `{ "detail": "<message>" }`; `apiFetch` throws it as
  an `Error`. Common: `401` (no/!valid token), `403` (not allowed), `404`,
  `409` (conflict).
- **IDs** are UUID strings. **Dates** ISO-8601.

Pages covered so far: **Join / Register · Home · Live · Profile · Connections
(rolodex) · Organizer (login, dashboard, people, control room)**.

---

## Authentication (Supabase, client-side)

Attendees never hit our backend to sign in — they authenticate directly with
Supabase Auth from the browser (`@/lib/supabase`). Two equal options, no password.

| Call | What | Why |
|---|---|---|
| `supabase.auth.signInWithOAuth({ provider: "google", … })` | Google one-tap | Fastest path for most attendees. Redirects to `…/auth/callback?next=<path>`. |
| `supabase.auth.signInWithOtp({ email, … })` | Email a 6-digit code | No-account, no-password fallback. `shouldCreateUser: true` creates the identity on first use. |
| `supabase.auth.verifyOtp({ email, token, type: "email" })` | Verify the code | Completes email sign-in; sets the session. |
| `supabase.auth.getUser()` / `onAuthStateChange` | Read / watch session | Pages gate on this before showing the form. |

**`GET /auth/callback`** (Next route handler, not the API) — exchanges the OAuth
`code` for a session cookie, then redirects to `next` (same-origin only; open-
redirect guarded). Phone OTP is **deferred to MVP** (India DLT delay); phone is
collected as profile data instead.

---

## Events

### `GET /events`

The attendee **home feed** — every event, soonest first, for the dashboard.

- **Why:** powers the personal home (`/home`): "Happening today" + "Upcoming" +
  "Past" buckets. The list is public so the page renders before sign-in; the
  per-caller `registered` flag is filled in once a token is present.
- **Auth:** optional. Anonymous works (returns `registered: false` everywhere);
  send the Bearer token to get the caller's own registration state.
- **Response `200`** (`list[EventBrowseItem]`):
  ```json
  [{ "id": "uuid", "name": "Founders & Friends Summer Mixer",
     "date": "2026-07-01", "time": "18:00:00", "location": "Hyderabad",
     "status": "upcoming", "requires_code": true,
     "attendee_count": 38, "registered": false }]
  ```
- **Safety:** public-safe fields only — **no** organizer config (capacity,
  durations), **no** PII (just a count), and the access code is never exposed
  (only the `requires_code` boolean). `registered` reflects the *caller's* own
  state, never anyone else's.
- **Pilot scope:** returns all events (one org / one event for the pilot; the
  events row is already anon-readable). MVP will scope to invited/discoverable
  events per tenant — see PRODUCT.md.

### `GET /events/{eventId}`

Event details that power the join screen header ("You're joining X").

- **Why:** confirm the attendee is at the right event before they sign in; also
  lets a page detect if the signed-in user is this event's organizer.
- **Auth:** none (public).
- **Response `200`** (`EventResponse`, abridged):
  ```json
  { "id": "uuid", "name": "Founder Mixer", "date": "2026-06-14",
    "time": "18:30:00", "location": "The Garage, Hyderabad",
    "organizer_id": "uuid", "status": "upcoming",
    "requires_code": true }
  ```
- **`requires_code`** — does this event have an access code? The code value
  **itself is never returned** (it's a secret in a service-role-only table). The
  page uses this flag to decide whether to show the code gate before the form.
- **Errors:** `404` event not found.

### `GET /events/{eventId}/stats`

Public, non-PII social proof for the registration header ("38 already inside").

- **Why:** the join screen shows live momentum without exposing who's attending.
- **Auth:** none (public). Returns a **count only** — names/contacts are never
  client-readable.
- **Response `200`** (`EventStats`): `{ "attendee_count": 38 }`.
- **Errors:** `404` event not found.

### `POST /events/{eventId}/verify-code`

Pre-check an access code so the form can unlock before submit.

- **Why:** lets the code gate give instant feedback. This is a **UX convenience,
  not the security boundary** — registration re-checks the code server-side.
- **Auth:** none (public).
- **Request body** (`VerifyCodeRequest`): `{ "code": "MIXER" }` (trimmed,
  case-insensitive). Open events (no code) always return valid.
- **Response `200`** (`VerifyCodeResponse`): `{ "valid": true }`.
- **Errors:** `404` event not found.

### `POST /events/join`

Reverse lookup: resolve an access **code → event**. Powers the attendee hub's
"Join via access code" / "Join via QR" buttons (and the `/join?code=` deep link),
where the attendee knows a code but not which event it belongs to.

- **Why:** the join-first flow — attendees never browse a list of events; they
  enter the code/QR the organizer gave them and we route them in.
- **Auth:** none (public — the event id is already public; sign-in is enforced on
  the hub and at registration).
- **Request body** (`JoinRequest`): `{ "code": "MIXER7" }` (trimmed,
  case-insensitive).
- **Response `200`** (`JoinResponse`): `{ "event_id": "uuid", "name": "…",
  "requires_code": true }`.
- **Errors:** `404` no event matches that code.

### `GET /events/{eventId}/access-code`

The event's secret code — returned **only** to the owning organizer.

- **Why:** lets the organizer view / copy / show the code (and build the QR). This
  is the single place the value leaves the backend, gated on ownership.
- **Auth:** required (**organizer, owner only**).
- **Response `200`** (`AccessCodeResponse`): `{ "code": "MIXER7" }` or
  `{ "code": null }` when the event is open.
- **Errors:** `403` not the owner; `404` event not found.

### `POST /events/{eventId}/access-code/regenerate`

Mint a fresh, unique code (the old one stops working immediately).

- **Why:** organizers can rotate a leaked code, or generate one for an event that
  was created open. Codes are 6 chars from an unambiguous alphabet (no I/L/O/0/1)
  and are guaranteed unique across events (so the reverse lookup is unambiguous).
- **Auth:** required (**organizer, owner only**). Audited as
  `event.code_regenerated` (the value is never logged).
- **Response `200`** (`AccessCodeResponse`): `{ "code": "K7M3PQ" }`.
- **Errors:** `403` not the owner; `404` event not found.

### `DELETE /events/{eventId}/access-code`

Remove the code — the event becomes open (link/QR is the only gate).

- **Auth:** required (**organizer, owner only**). Audited as `event.code_cleared`.
- **Response `200`** (`AccessCodeResponse`): `{ "code": null }`.
- **Errors:** `403` not the owner; `404` event not found.

---

## Room code (Phase 2 — self-service day-of check-in)

A **second** per-event secret, separate from the access/join code above. Lives in
its own service-role-only table `event_room_codes` (migration 010), so attendee
phones can never read it. The value is revealed **only** on the organizer's
control-room screen — never in a link or QR — and never appears in the audit log.

### `GET /events/{eventId}/room-code`

The event's room code — returned **only** to the owning organizer to reveal in the room.

- **Auth:** required (**organizer, owner only**).
- **Response `200`** (`RoomCodeResponse`): `{ "code": "AB12" }` or `{ "code": null }`
  when check-in hasn't been opened.
- **Errors:** `403` not the owner; `404` event not found.

### `POST /events/{eventId}/room-code/regenerate`

Open check-in / mint a fresh room code (doubles as the first "generate"). Any code
shown before stops working. Room codes are 4 chars from the same unambiguous
alphabet; no global uniqueness needed (matched only within one event).

- **Auth:** required (**organizer, owner only**). Audited as
  `event.room_code_regenerated` (the value is never logged).
- **Response `200`** (`RoomCodeResponse`): `{ "code": "K7M3" }`.
- **Errors:** `403` not the owner; `404` event not found.

### `DELETE /events/{eventId}/room-code`

Close check-in — no one can self-arrive until a new code is opened.

- **Auth:** required (**organizer, owner only**). Audited as `event.room_code_cleared`.
- **Response `200`** (`RoomCodeResponse`): `{ "code": null }`.
- **Errors:** `403` not the owner; `404` event not found.

### `POST /events/{eventId}/attendees/me/arrive`

A pre-registered attendee checks **themselves** in by typing the room code.
Flips their own status `registered` → `arrived` (joining the seating pool).

- **Why:** self-service check-in — no door queue, no organizer tapping 40 names.
- **Auth:** required. Identity resolved from the JWT (you can only check yourself in).
- **Body** (`ArriveRequest`): `{ "room_code": "AB12" }` (trimmed, case-insensitive).
- **Response `200`** (`AttendeeResponse`): the updated attendee. Idempotent — if
  you're already `arrived`, returns `200` without re-checking the code. Audited as
  `attendee.self_arrived` (the code value is never logged).
- **Errors:** `403` wrong code; `404` not registered for this event; `409` check-in
  isn't open yet (no room code set) or the event has ended.

---

## Me (cross-event)

### `GET /me/connections`

The caller's **cross-event** Rolodex: everyone they've met across every event
they've attended, each entry tagged with which event it came from.

- **Why:** powers the hub's "My connections" button — a personal address book that
  outlives any single event.
- **Auth:** required. Identity is resolved from the JWT (the `user_id` on the
  caller's attendee rows), never the URL.
- **Response `200`** (`MyConnectionsResponse`):
  ```json
  { "total_people_met": 12, "events_count": 2, "matches_count": 3,
    "connections": [ { "attendee_id": "uuid", "name": "Maya", "role": "…",
      "shared_interests": ["AI"], "note": "…", "mutual": true,
      "event_id": "uuid", "event_name": "Founders Mixer", "event_date": "2026-07-01",
      "round_number": 1, "table_number": 2, "…": "…" } ] }
  ```
- **Notes:** reuses the per-event connection builder, so likes/notes/shared
  interests behave exactly like the single-event Rolodex.

---

## Attendees

### `GET /events/{eventId}/attendees/me`

The caller's own registration for this event, if any.

- **Why:** lets the join page skip the form for already-registered users and send
  them straight to the live dashboard.
- **Auth:** required (attendee).
- **Response `200`** (`AttendeeResponse`): `{ "id": "uuid", "event_id": "uuid", … }`.
- **Errors:** `404` not registered yet (expected — the frontend treats this as
  "show the form").

### `POST /events/{eventId}/attendees`

Register the signed-in user as an attendee (create their profile).

- **Why:** the core of the Join page — turns an authenticated identity into an
  event attendee.
- **Auth:** required (attendee). `user_id` is taken from the token, never the body.
- **Request body** (`AttendeeCreate`):
  ```json
  { "name": "Maya Sharma", "role": "Founder at Acme",
    "looking_for": "investors, designers",   // optional, null if blank
    "linkedin_url": "https://…",              // optional
    "whatsapp_number": "+91…",                // optional
    "interests": ["AI", "Climate"],           // optional tags; shared ones highlight at the table
    "access_code": "MIXER" }                  // required iff event.requires_code
  ```
- **Responses:**
  - `201` created (`AttendeeResponse`).
  - `200` **already registered** — returns the existing record (idempotent
    re-register; same shape). Frontend treats both as success. The code gate is
    **skipped** on this path, so returning attendees are never locked out.
- **Errors:** `403` incorrect/missing event code; `409` event has already ended;
  `404` event not found.
- **Notes:** `access_code` is verified server-side (case-insensitive) and is
  **never stored** on the attendee. This is the real enforcement; `verify-code`
  is only a pre-check.
- **Notes:** if the event has `auto_arrive_on_register` (default **true**), the
  new attendee is marked `arrived` immediately — registration happens at the
  venue for the pilot.

### `PATCH /events/{eventId}/attendees/me`

The attendee edits their **own** profile (fix a typo'd WhatsApp, add interests).

- **Why:** registration captured contact + interests once with no way to correct
  them; the rolodex depends on those fields being right.
- **Auth:** required (attendee — resolved from JWT, so you can only edit yourself).
- **Request body** (`AttendeeSelfUpdate`, all optional): `name`, `role`,
  `looking_for`, `linkedin_url`, `whatsapp_number`, `interests`. Status is **not**
  editable here — only the organizer moves people between arrived/left.
- **Response `200`** (`AttendeeResponse`): the updated record.
- **Errors:** `404` not registered; `401` no/expired token.

---

## Live (attendee dashboard)

### `GET /events/{eventId}/live`

The single authoritative snapshot that powers the attendee Live Dashboard.

- **Why:** *Realtime is a doorbell, REST is the source of truth* (REQ-RT-01). The
  phone fetches this on load, refresh, websocket reconnect, tab wake, network
  regain, and on every realtime ping — same code path — so recovery is one call.
  A mid-round reload reconstructs the table from here, not from client/URL state.
- **Auth:** required (attendee). **The attendee is resolved from the JWT** — no
  id in the URL, so there is no IDOR surface (you only ever see your own state).
- **Response `200`** (`LiveStateResponse`):
  ```json
  { "server_time": "2026-07-01T18:05:00Z",   // for client clock-skew correction
    "event_status": "active",
    "phase": "in_round",                       // not_started | in_round | between_rounds | ended
    "attendee_id": "uuid", "attendee_status": "arrived",
    "seated": true,
    "round": { "round_id": "uuid", "round_number": 3, "status": "active",
               "started_at": "…", "duration_seconds": 300, "ends_at": "…" },
    "seat": { "table_number": 4,
              "tablemates": [ { "attendee_id": "uuid", "name": "Asha", "role": "Founder" } ] },
    "icebreaker": { "question_text": "…", "target_attendee_id": "uuid" } }
  ```
- **Notes:** `round`/`seat`/`icebreaker` are null outside their phase; `icebreaker`
  may be null briefly while it generates async (the UI shows a "crafting…" state).
  Tablemates carry **name + role + `avatar_url` + `liked`** (whether *you* have
  liked them), plus conversation seeds **`looking_for`, `interests`, and
  `shared_interests`** (tags you both picked) — but never contact info (that's the
  rolodex). The countdown is derived locally from `ends_at` + `server_time`.
- **Errors:** `404` event not found **or** caller not registered (frontend routes
  the latter to the register page); `401` no/expired token.

---

## Likes (the ❤️ that becomes a "match")

One-directional, idempotent likes captured live at the table. Stored in
`connection_likes`, which has **RLS on with no policies → service-role only**, so
nobody can read who-liked-whom from the client. Surfaced back only as flags on
*your own* live snapshot (`liked`) and rolodex (`liked` / `mutual`). Mutual like = a
**match**.

### `POST /events/{eventId}/likes`
- **Auth:** required (attendee — liker resolved from JWT, never the body).
- **Body:** `{ "target_attendee_id": "uuid" }`
- **Response `201`:** `{ "liked": true }`. Idempotent — liking twice is a no-op `201`.
- **Errors:** `400` self-like; `404` caller not registered **or** target unknown.

### `DELETE /events/{eventId}/likes/{targetAttendeeId}`
- **Auth:** required (attendee). Idempotent — unliking what you never liked still `200`.
- **Response `200`:** `{ "liked": false }`.

---

## Meeting intents (Phase 3a — pre-event "I want to meet X")

Pre-event picks made while browsing the directory. **Distinct from likes** (those
are the post-meeting rolodex signal) — stored in `meeting_intents`, **RLS on with
no policies → service-role only**. Privacy: you only ever read *your own* picks
(`GET /me`); the at-table nudge (`wanted` on your live snapshot) is one-sided; and
unrequited interest is never disclosed — only **mutual** picks surface, and only
*after* the event (`GET /matches`). Picks are capped at the planned round count
(`target_rounds`, default 5) and editable until and during the event. Phase 3a
captures + surfaces intent only; Phase 3b will teach seating to honor it.

### `POST /events/{eventId}/intents`
- **Auth:** required (attendee — liker resolved from JWT, never the body).
- **Body:** `{ "target_attendee_id": "uuid" }`
- **Response `201`:** `{ "wants": true, "used": N, "cap": M }`. Idempotent.
- **Errors:** `400` self-pick **or** target is a speaker/host (not in the rotation);
  `404` caller not registered **or** target unknown; `409` event ended **or** cap reached.

### `DELETE /events/{eventId}/intents/{targetAttendeeId}`
- **Auth:** required (attendee). Idempotent.
- **Response `200`:** `{ "wants": false, "used": N, "cap": M }`.

### `GET /events/{eventId}/intents/me`
- **Auth:** required (attendee). Your own picks only.
- **Response `200`:** `{ "used": N, "cap": M, "target_ids": ["uuid", …] }`.

### `GET /events/{eventId}/intents/matches`
- **Auth:** required (attendee). **Mutual picks only**, revealed after the event.
- **Response `200`:** `{ "count": N, "matches": [{ attendee_id, name, role, company, avatar_url, linkedin_url, website_url }] }`.
- **Errors:** `409` event not ended yet; `404` caller not registered.

> The directory (`GET /events/{eventId}/directory`) also returns `wanted_by_me` per
> entry and `my_intents_used` / `my_intents_cap` (cap `0` for an organizer preview).

---

## Notes (private memory jogger)

A one-line private note an attendee jots about someone they met ("intro to Priya
re: hiring"). Author-private, stored in `connection_notes` (**RLS on, no policies
→ service-role only**). Surfaced back only in the author's own rolodex.

### `PUT /events/{eventId}/notes/{targetAttendeeId}`
- **Auth:** required (attendee — author resolved from JWT).
- **Body** (`NoteRequest`): `{ "note": "intro to Priya re: hiring" }` (≤500 chars).
  Empty/blank text **clears** the note (PUT stays idempotent).
- **Response `200`** (`NoteResponse`): `{ "target_attendee_id": "uuid", "note": "…" }`
  (`note` is `null` when cleared).
- **Errors:** `404` caller not registered **or** target unknown.

### `DELETE /events/{eventId}/notes/{targetAttendeeId}`
- **Auth:** required (attendee). Idempotent — deleting a missing note still `200`.
- **Response `200`:** `{ "target_attendee_id": "uuid", "note": null }`.

---

## Connections (post-event rolodex)

### `GET /events/{eventId}/connections`
Everyone you shared a table with, with how to reach them — unlocked once the event
(or your rounds) is done.

- **Auth:** required (attendee — resolved from JWT).
- **Response `200`** (`ConnectionsResponse`): `{ "connections": [ … ], "matches_count": 0 }`
  where each entry carries `attendee_id`, `name`, `role`, `looking_for`,
  `linkedin_url`, `whatsapp_number`, `avatar_url`, `interests`, **`shared_interests`**
  (tags you both picked), **`note`** (your private note about them, or null),
  `round_number`, **`liked`** (you liked them), **`mutual`** (you liked each other =
  a match). One entry **per shared round** (a repeat pairing appears twice — the
  frontend groups by person).
- **Notes:** `matches_count` = number of distinct mutual likes. Contact fields are
  only ever returned here (and only for people you actually met).

---

## Organizer — People directory

### `GET /events/{eventId}/attendees`
Full roster **including contact info** — event owner only (`403` otherwise).
- **Response `200`:** `AttendeeResponse[]` (`id, name, role, looking_for,
  linkedin_url, whatsapp_number, interests, avatar_url, status, created_at`). The
  console offers a **CSV export** (built client-side) and a **QR invite** from this list.

### `POST /events/{eventId}/attendees/walkin`
Add someone at the door with no account (organizer only). They are seated like
everyone else (`user_id` is null, `status` = `arrived`).
- **Body:** `{ "name", "role", "looking_for"?, "linkedin_url"?, "whatsapp_number"?, "interests"? }`
- **Response `201`:** `AttendeeResponse`.

### `PATCH /events/{eventId}/attendees/{attendeeId}`
Move someone between `registered` / `arrived` / `left` (organizer only). Only
`arrived` attendees are seated by the planner.
- **Body:** `{ "status": "arrived" }` → **Response `200`:** `AttendeeResponse`.

---

## Organizer — Control room (rounds)

The console is a state machine: **idle → draft (preview) → active → end/cancel**.
All endpoints are event-owner only. Drafts live in `round_drafts` (no client RLS,
not in the realtime publication) so phones see nothing until **publish**.

| Call | What | Response |
|---|---|---|
| `GET /events/{id}/rounds/current` | Active round + assignments (powers the live grid). `404` if none. | `RoundWithAssignmentsResponse` |
| `GET /events/{id}/rounds/draft` | The pending preview (e.g. after reload). `404` if none. | `RoundDraftResponse` |
| `POST /events/{id}/rounds/start` | Generate the next seating **draft** to preview. `409` if a round/draft already exists. | `201 RoundDraftResponse` |
| `POST /events/{id}/rounds/regenerate` | Re-plan & replace the pending draft. `404` if no draft. | `RoundDraftResponse` |
| `POST /events/{id}/rounds/publish` | Make the draft live (Realtime fires; icebreakers generate async). Idempotent on retry; `409` if attendance changed since preview. | `201 RoundWithAssignmentsResponse` |
| `POST /events/{id}/rounds/end` | Complete the active round (kept in history → connections). | `RoundResponse` |
| `POST /events/{id}/rounds/cancel` | **Erase** the active round + assignments + icebreakers (bad seating leaves no trace). | `RoundCancelResponse` |
| `POST /events/{id}/end` | End the whole event; completes any active round; unlocks connections. | `EventResponse` |

- **Draft shape (`RoundDraftResponse`):** `{ id, round_number, duration_seconds,
  arrived_count, table_count, repeat_pairings, assignments: [{ attendee_id, name,
  table_number }] }`. `repeat_pairings` is the trust signal shown as a warning.
- **Active shape (`RoundWithAssignmentsResponse`):** round fields + `assignments:
  [{ id, round_id, event_id, attendee_id, table_number }]` (**no names** — the
  console joins via `GET /events/{id}/attendees` for names + avatars).
- **404 vs error:** the console branches on `ApiError.status === 404` to tell
  "no round/draft yet" apart from real failures.

---

## Organizer — Analytics & live pulse

### `GET /events/{eventId}/live-stats`
Live "room pulse" the control room polls (~12s) during the event — event owner only.
- **Response `200`** (`LiveStats`): `{ registered, arrived, seated_now, not_seated,
  likes_count, matches_count, active_round_number }`. `seated_now`/`active_round_number`
  reflect the active round (0/null if none).

### `GET /events/{eventId}/analytics`
Post-event summary (event owner only), shown on the "wrapped" screen.
- **Response `200`** (`EventAnalytics`): `{ total_attendees, rounds_completed,
  avg_unique_people_met, total_likes, total_matches }`. A match is counted once
  per pair.

---

_Append the next page's endpoints below as we integrate them._
