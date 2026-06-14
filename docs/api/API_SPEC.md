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

Pages covered so far: **Join / Register**.

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

### `GET /events/{eventId}`

Event details that power the join screen header ("You're joining X").

- **Why:** confirm the attendee is at the right event before they sign in; also
  lets a page detect if the signed-in user is this event's organizer.
- **Auth:** none (public).
- **Response `200`** (`EventResponse`, abridged):
  ```json
  { "id": "uuid", "name": "Founder Mixer", "date": "2026-06-14",
    "time": "18:30:00", "location": "The Garage, Hyderabad",
    "organizer_id": "uuid", "status": "upcoming" }
  ```
- **Errors:** `404` event not found.

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
    "whatsapp_number": "+91…" }               // optional
  ```
- **Responses:**
  - `201` created (`AttendeeResponse`).
  - `200` **already registered** — returns the existing record (idempotent
    re-register; same shape). Frontend treats both as success.
- **Errors:** `409` event has already ended; `404` event not found.
- **Notes:** if the event has `auto_arrive_on_register` (default **true**), the
  new attendee is marked `arrived` immediately — registration happens at the
  venue for the pilot.

---

_Append the next page's endpoints below as we integrate them (Waiting room → live
state; Live → icebreakers; Connections → rolodex; Organizer → control)._
