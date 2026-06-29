# Future Scope — deferred "big build" features

> Parking lot for features we've consciously decided are valuable but **out of
> scope for now** because each is a large, standalone build. Anything here has
> been discussed and deferred on purpose — not forgotten. When picking one up,
> spec it into phases first (per the project's "brainstorm before code" rule).

---

## Web Push notifications (Live Notifier — Tier 2)

**Why it's here:** the in-app Live Notifier (shipped — see `live-notifier`) is
**Tier 1**: it only reaches an attendee whose browser tab is **open and in the
foreground**. When a phone is **locked or the app is backgrounded**, the browser
freezes the page — our JavaScript stops, the websocket suspends, and
`navigator.vibrate` cannot fire. So a sleeping phone gets **nothing** until the
person reopens the app (at which point they get one up-to-date toast, not a flood).

At a real event most phones are asleep, so reaching them requires **OS-level push**.

**What Tier 2 is:** Web Push — a Service Worker + a per-device push subscription +
the platform push services (FCM/APNs under the hood), so the organizer starting a
round (or sending a broadcast) lights up the phone's lock screen and buzzes it even
when the app is closed.

**Why it's a big build (the deferral reason):**
- Service Worker registration + lifecycle + a push-event handler.
- Backend: store push subscriptions per attendee; send pushes (VAPID keys) fanned
  out to the room on each round/broadcast event; handle expiry/cleanup.
- A permission-prompt UX (ask at the right moment, handle denial gracefully).
- **iOS:** Web Push only works if the site is **installed as a PWA** (Add to Home
  Screen) on iOS 16.4+ — so it needs an install nudge + a manifest, and a fallback
  for users who don't install.
- Deliverability/quiet-hours/dedupe considerations mirroring the Tier-1 signature
  de-dupe so the 3× rebroadcast doesn't push 3 times.

**Shares this limitation (all foreground-only until Tier 2 lands):** organizer live
broadcast/announcements, "round ending soon" nudge, and the live mutual-match alert.
The post-event recap actions (vCard / LinkedIn / email recap) are **not** affected —
the recap is opened deliberately.

---

## "Loose ends" reconnect (post-event)

Turn near-misses into follow-ups using data we already store. After the event,
surface on the recap + in the email recap:
- *"N people wanted to meet you, but the rounds ran out"* — from `meeting_intents`
  (`wants_me` that never shared a table).
- *"You sat with Ravi but never connected — here's their LinkedIn."* — people in
  the rolodex with no like/note/save.
- *"You liked 3 people who haven't liked back yet"* (gentle, no pressure).

**Why deferred (chosen 2026-06-29):** valuable and low-effort (reuses likes/intents/
assignments), but we're shipping the shareable story card first. Pairs naturally with
the email recap — a "here's who to follow up with" section. Small build: a derived
section, no new tables.

## Mutual contact exchange (privacy-gated deeper details)

Today the vCard / email recap share **public** info only (name, role, company,
LinkedIn/website). Add an opt-in so that **when two people match** (mutual like),
their exchange includes richer contact details (email, and phone if they choose to
add it) — gated strictly on mutual consent.

**Why deferred (chosen 2026-06-29):** makes a "match" genuinely actionable, but needs
a consent UX + a profile field for shareable email/phone + careful privacy rules
(only ever released on mutual match). Worth doing right, not rushed.

## Shareable story card — link-preview (OG image) follow-up

The story card (shipped — client-rasterized PNG via the native share sheet) could
later also power a **server-rendered OG image** (`next/og`) so pasting a recap link
into WhatsApp/Twitter shows a rich preview. Deferred because it needs an
unauthenticated, signed data path (don't let numbers be spoofed via query params).

## AI / natural-language people search (Search — Phase 2)

**Phase 1 shipped:** generic keyword search (`lib/connections/search.ts` +
`components/connections/search-box.tsx`) on the rolodex, event directory, and
cross-event list — matches name/role/company/looking-for/interests/bio, ranked,
highlighted. That covers literal queries ("developer", "b2b").

**Phase 2 = understanding intent**, e.g. *"someone who could be my fractional CTO"*
or *"who can help me hire"* — where the right person never wrote those words. Two
options (deferred decision):
- **B. LLM query-expansion (leaning this first):** one cheap Haiku call turns the
  natural-language query into structured keywords/roles, then runs the Phase-1
  engine. No new infra, explainable ("we searched: engineer, swe, backend"), ~1s.
- **A. Embeddings + Supabase pgvector:** embed every profile + the query, rank by
  meaning. Best recall, but needs an embeddings provider (Claude has none → Voyage/
  Vertex), re-embedding on profile edit, and a vector store.

**Why deferred (chosen 2026-06-29):** Phase 1 keyword search is robust and enough
for this week's event; prove the UX first, add AI when literal search hits its
ceiling. Privacy boundary stays the same — you only ever search your own network /
events you attended.

## Cross-event "Event Memory" (community intelligence)

Returning-attendee detection across events, a community network graph that grows
event-over-event, and NPS/feedback trends across the series. The real long-term
moat (ties into the broader Event Intelligence vision in `AGENTS.md`). Large
because it needs a cross-event identity/dedupe model + new analytics surfaces.
