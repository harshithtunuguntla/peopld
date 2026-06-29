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

## Cross-event "Event Memory" (community intelligence)

Returning-attendee detection across events, a community network graph that grows
event-over-event, and NPS/feedback trends across the series. The real long-term
moat (ties into the broader Event Intelligence vision in `AGENTS.md`). Large
because it needs a cross-event identity/dedupe model + new analytics surfaces.
