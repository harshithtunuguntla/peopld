# UI Import Handoff — `demo-workup-ui` → `event-hub/frontend`

> **Status:** Planning / inventory. **No code written yet.** This is the "pick up where
> we left off" doc. Read it top-to-bottom before importing anything.
> **Author pass:** 2026-06-15. **Source scanned:** `E:\Shift-Pro\exploring-new\ui-emergent\demo-workup-ui`.

---

## 0. Why this doc exists

Two things the user flagged about our live app:

1. **Everything is dark.** We locked every app surface to dark via route-segment
   layouts (`event/layout.tsx`, `organizer/layout.tsx` → hardcoded `dark` class).
   The user wants **light as the default**, with an **optional dark toggle**.
2. **Screens are missing / thin.** There is **no real sign-in / sign-up page**, and the
   organizer side is minimal (dashboard + people + live). The **`demo-workup-ui`
   prototype has a much richer, more polished set of screens** in *both* light and dark
   — a full host console, a beautiful auth page, an attendee scene set — that we should
   selectively **import + enhance**, not copy wholesale.

The demo is **static (mock data, visual hierarchy only)**. We import its *look, layout,
and components*, then wire them to our real FastAPI + Supabase backend and **drop
anything not in `pre-mvp.md`**.

---

## 1. The two codebases at a glance

| | `demo-workup-ui` (source) | `event-hub/frontend` (us) |
|---|---|---|
| Framework | Next 14, React 18, **JS/JSX** | Next 15, React 19, **TS/TSX** |
| Theme switch | **Runtime, user-toggleable**, light default | **Locked per route** (landing light, app dark), no toggle |
| Theme tokens | `.app-theme` CSS vars: `--canvas --surface --surface-2 --fg --fg-muted --fg-subtle --line --line-strong --brand --brand-soft --brand-contrast --panel-ink` | shadcn HSL: `--background --foreground --card --primary --secondary --muted --accent --border --ring` |
| Theme provider | `ThemeProvider` + `useTheme()` + `ThemeToggle` + localStorage | none (no provider) |
| Data | mock (`lib/peopld/*.ts`) | **real** (`lib/api.ts` + Supabase) |
| Organizer UI | full **`/console`** (6 screens) + `AppShell` sidebar + `CommandPalette` | `/organizer` (login, dashboard, people, live) |
| Auth page | polished `/auth` split-screen (sign in/up toggle) | `SignInPanel` only, no dedicated page |

**Good news:** our `globals.css` *already* has `:root` = light and `.dark` = dark shadcn
tokens. We are dark only because the **layouts force `dark`**. Flipping to "light default
+ toggle" is mostly: remove the forced class, add a provider/toggle, and verify
components use semantic tokens (most already do).

---

## 2. THEME DECISION (the big one)

**Recommendation: ship two themes, light default, with a toggle.** It is *not* a huge
task for us because the token plumbing already exists — and the demo proves the design
works in both modes. The work is plumbing + a token superset + a verification sweep, not
a re-skin.

### What it takes
1. **Add a `ThemeProvider`** (port the demo's — clean, localStorage-backed,
   `light | dark | system`, **`defaultPref="light"`**) at the app root, or scoped to app
   route groups. Convert to TS.
2. **Stop forcing `dark`.** `event/layout.tsx` + `organizer/layout.tsx` should inherit
   the provider's resolved theme instead of hardcoding `dark`. Landing stays locked light.
3. **Extend `globals.css`** with the demo's richer neutrals so imported console screens
   read clean tokens in *both* modes (see §6). Map them to shadcn equivalents where they
   overlap so we don't fork the system.
4. **Add `ThemeToggle`** to app headers (attendee hub, organizer shell) and a
   **Settings → Appearance** card (light / dark / system), exactly like the demo.
5. **Verification sweep:** every app surface must read semantic tokens (no hardcoded
   `bg-ink-950`/`text-cream`/`border-white/10`). Eyeball each screen in light *and* dark.

### Fallback (if we want to de-risk for the pilot)
Ship **light-only now**, but build it on the token system above so dark is a later flip,
not a rewrite. The user explicitly OK'd this: *"if 2 modes is huge we can go with light
for now."* My call: **do both** — the toggle is cheap given our existing tokens, and the
demo already solved the dark palette.

> **DESIGN_SYSTEM.md conflict to resolve:** §1.5 currently says "two themes, locked per
> route, never toggled." If we add a toggle, **that rule changes** and must be rewritten
> in the same PR (landing stays locked light; app surfaces become theme-aware, light
> default). Flag for the user — this is a deliberate reversal of an earlier decision.

---

## 3. Screen inventory — demo vs us

Legend: ✅ have it · 🟡 have a thinner version · ❌ missing

### Attendee
| Demo screen (`event/page.tsx` scenes) | Us | Notes |
|---|---|---|
| Invite (QR splash) | 🟡 | we have join dialogs/QR scanner, not a branded splash |
| Join (name + role) | ✅ | `register-form` |
| Interests | ✅ | part of register (`tag-input`) |
| Waiting room (countdown + roster) | 🟡 | `/event/[id]/live` waiting state exists; demo's is richer |
| Round reveal (table drops) | 🟡 | `live-screens` has reveal; demo is more cinematic |
| Live table (pass + icebreaker) | ✅ | `boarding-pass` + `icebreaker-card` |
| Tablemate (person up close) | 🟡 | we have `person-card` in rolodex |
| Recap (your night summed) | ❌ | **no recap screen** — demo has a nice one |
| My connections | ✅ | `/me/connections` (we built this) |

### Organizer — **the biggest gap**
| Demo `/console` screen | Us | Notes |
|---|---|---|
| `AppShell` (sidebar + topbar + ⌘K + theme toggle) | ❌ | we have a thin `organizer/shell.tsx` |
| Dashboard (`/console`) — live hero, bento KPIs, "needs attention", activity, run-the-room, room energy, check-in | 🟡 | our dashboard is a plain event list + access-code control |
| Events list (`/console/events`) — filter segmented, live banner, card grid | 🟡 | ours is functional, not this polished |
| Event detail (`/console/events/[id]`) | ❌ | no single-event config screen |
| Create event (`/console/events/new`) — 4-step wizard | 🟡 | ours is an inline create form |
| Command center (`/console/live`) — timer ring, round queue, floor map, AI icebreaker push, live feed | 🟡 | our control room is simpler |
| People (`/console/people`) — KPI strip, search, filters, card grid | 🟡 | ours is a list + QR + CSV |
| Analytics (`/console/analytics`) — recharts area/bar, top connectors | ❌ | **not in pre-mvp** — see §7 |
| Settings (`/console/settings`) — profile, **appearance/theme**, notifications, plan | ❌ | only Appearance is relevant now |

### Auth
| Demo | Us | Notes |
|---|---|---|
| `/auth` split-screen (brand panel + sign in/up toggle, social + email, "join as guest" link) | ❌ | **build this** — the missing sign-in/sign-up page the user wants |

---

## 4. Component inventory — import / enhance / drop

### Import & convert to TS (high value)
- **`lib/peopld/theme/ThemeProvider.tsx`** → `lib/theme/theme-provider.tsx` (TS).
- **`console/ThemeToggle.tsx`** → `components/ui/theme-toggle.tsx`.
- **`console/AppShell.tsx`** → new `components/organizer/console-shell.tsx` (sidebar nav,
  topbar, mobile drawer). Drop the static upsell/plan card unless we want it.
- **`console/ui.tsx`** primitives: `Card`, `PageHeader`, `BrandButton`/`GhostButton`
  (or fold into our `Button`), `StatCard`, `StatusChip`, `Avatar`, `Segmented`, `Toggle`,
  `BoardingMini`, `LogoMark`. These are the backbone of every console screen.
- **`console/CommandPalette.tsx`** → ⌘K nav (nice-to-have, low risk).

### Enhance what we already have
- Dashboard, events list, people, control-room, waiting room, reveal, live table — **keep
  our wiring, adopt the demo's layout/markup** (bento, segmented filters, timer ring,
  floor map, KPI strips).

### Build new (from demo design, wired to our data)
- **`/auth` page** (sign in/up) — reuse our `SignInPanel`/Supabase logic inside the
  demo's split-screen shell.
- **Attendee recap screen** — "you met N people tonight" → links to rolodex.
- **Organizer Settings → Appearance** (theme picker), event detail, create-event wizard.

### Drop (don't import)
- `app/api/[[...path]]/route.js` (Mongo proxy), `app/providers.js` (react-query),
  scene-switcher nav, `PhoneFrame`/device mock for *real* routes (marketing only).
- All `lib/peopld/*.ts` **mock data** — we use real API responses.
- Extra display fonts (DM Serif, Cormorant, Bebas) — keep Fraunces/Inter/JetBrains Mono.
- The 50+ stock `components/ui/*.jsx` shadcn dump — pull individual ones **only if a
  screen needs it** (e.g. we may want `recharts` *only if* we ever do analytics).

---

## 5. Mapping: demo token/class → our semantic token

When converting a demo file, translate its classes:

| Demo | Ours (shadcn) |
|---|---|
| `bg-canvas` | `bg-background` |
| `bg-surface` | `bg-card` |
| `bg-surface-2` | `bg-secondary` / `bg-muted` |
| `text-fg` | `text-foreground` |
| `text-fg-muted` / `text-fg-subtle` | `text-muted-foreground` |
| `border-line` / `border-line-strong` | `border-border` |
| `bg-brand` / `text-brand` | `bg-accent` / `text-accent` (our coral) |
| `bg-brand-soft` | `bg-accent/10` |
| `--panel-ink` (dark sub-panel on light) | **new token needed** (see §6) |
| inline `style={{ background: '#FF5A3C' }}` | token class — **never inline hex** (DESIGN_SYSTEM §0) |

---

## 6. Token gap to add to `globals.css`

The demo's neutral ramp is richer than shadcn's defaults. Add these to **both** `:root`
(light) and `.dark`, so imported console screens have clean tokens in either mode:

- `--surface-2` (hover/deeper fill) — maps near `secondary`/`muted`, but add explicitly.
- `--fg-subtle` (third text tier below `muted-foreground`).
- `--line-strong` (stronger hairline for inputs/dividers).
- `--panel-ink` + `--panel-ink-fg` (the dramatic dark sub-panel shown *on light* — used
  in the dashboard floor-map panel and primary CTAs).
- `--brand-soft` (accent at ~12% for chips/active nav).
- `--shadow-card` + `.card-shadow`, `.app-dots`, `.app-grid-bg`, `.theme-transition`
  utilities (copy from demo `globals.css`).

Keep raw hex **only** in one source file (`lib/design/colors.ts`) per DESIGN_SYSTEM §0;
expose new tokens via Tailwind so components never inline hex.

---

## 7. Scope guard — what is NOT in `pre-mvp.md`

The demo shows aspirational features. **Per CLAUDE.md, the build spec is law.** These are
**visual-only in the demo and should NOT be wired** for the pilot (import the *layout* only
if cheap, but no backend, or skip entirely):

- **Analytics dashboards** (connection velocity, round perf, engagement charts) — MVP+.
- **Room energy / "needs attention" AI ops / command palette** — polish, not pilot-critical.
- **Plan & billing, team, notifications settings** — not pilot. *Appearance/theme stays.*
- **"Connect"/"message" between attendees, hearted-intro KPIs** — beyond pre-mvp rolodex.

When in doubt: does `pre-mvp.md` list it? If no, it's chrome — build the shell, leave the
data out, or defer.

---

## 8. Recommended phased plan (each phase = reviewable)

> **Progress (2026-06-15):** Phase 1 ✅ · light-contrast fix ✅ · Phase 2 ✅ · waiting-room
> uplift + access-code-only join ✅ (Phase 5 start). Next: Phase 3 (console shell).

### Waiting-room uplift + access-code-only join (2026-06-15)

**Waiting room (`not_started` phase) rebuilt** — replaced the static "You're checked in /
the first round will start any moment" panel with a live, demo-styled screen:
- "You're in" status pill + "Hi, {first name}" (name from the live snapshot, not hardcoded).
- **Animated hourglass** (`components/live/hourglass.tsx`, framer-motion) *instead of a fake
  countdown* — the host starts rounds by hand, so there's no real timer; the hourglass conveys
  "time passing." Seamless loop via a 180° flip at the sand-reset boundary; honors reduced-motion.
- **"Tonight" agenda card** — planned rounds + theme names from the canonical `ROUNDS` set,
  count driven by `event.target_rounds` (fallback 5), duration from `default_round_duration_seconds`.
  ⚠️ Organizer-authored agenda is a **future hook** — topics are the default set for now (per the
  user: "assign something randomly right now").
- **Live roster card** — "{N} in the room" with real avatars, *not hardcoded*. New backend data:
  `LiveStateResponse` now carries `event_name`, `attendee_name`, `target_rounds`, `round_seconds`,
  and `roster {count, preview[]}` (capped at 12 faces + "+N"; everyone not `left`). Roster is
  name+avatar only (no PII), scoped to the caller's own event. `_waiting_roster()` in `live.py`;
  `RosterPerson`/`WaitingRoster` schemas; `FakeSupabase` gained `.neq()`.

**Access-code-only join (security):** the access code is handed out *in the room* and is now the
**only** way in — no link/QR can bypass it.
- `/join` no longer auto-joins from `?code=`; it **ignores the param** and shows the manual
  code-entry gate (signed-out → SignInPanel → back to `/join`).
- Hub: removed the "Join via QR" action + `QrScannerDialog` (deleted) — code entry + My
  connections only.
- Organizer `InviteDialog`: QR now opens **`/join` only (never the code)**; the access code is
  shown large to read aloud. Removed `codeFromScan` from `lib/join.ts`.
- Old shared `/join?code=` links still work but now require typing the code (no bypass).

1. **Theme foundation** ✅ — `ThemeProvider` (light default) + `ThemeToggle`, extended
   `globals.css` tokens (§6), unforced `dark` in app layouts, rewrote DESIGN_SYSTEM §1.5.
   Toggle wired into /home hub + organizer shell. **Plus a light-mode contrast pass:** added
   theme-aware `success`/`warning`/`info` tokens + deepened light `--accent`, and migrated all
   bright-brand *text* (chlorine/ember/ice/gold/coral) in app surfaces to readable tokens
   (brand colors stay only as fills). `glow-ember` is a CSS utility — left as-is.
2. **Auth page** ✅ — `/auth` split-screen (left dark brand island, right theme-aware form),
   cosmetic sign in/up toggle, embeds `SignInPanel` (Google + email OTP). Landing nav now
   links "Sign in" → `/auth`. Dev join code via `supabase/seed_dev.sql` (code `MEET25`).
3. **Organizer console shell** — `AppShell` → `console-shell` + console `ui` primitives;
   re-home `/organizer` screens under the new shell.
4. **Organizer screens uplift** — dashboard (real KPIs we can source), events list +
   create wizard + event detail, command center (timer/floor/icebreaker), people.
5. **Attendee uplift** — invite splash, waiting room, reveal, live table, **recap**.
6. **Docs + tests** — update DESIGN_SYSTEM, API_SPEC (if endpoints added), PRODUCT
   decision log, README; `tsc` + `next build` + backend pytest green; 375px & ≥1024px pass.

> Phases 1–2 unblock the user's two explicit pain points (dark-only, no auth page) fastest.

---

## 9. Decisions (CONFIRMED 2026-06-15)

1. **Two themes — light default + dark toggle.** ✅ Reverses DESIGN_SYSTEM §1.5 (rewrite it).
2. **Full `/console` IA, minus analytics/billing.** ✅ Adopt sidebar shell + dashboard,
   events list, create-event wizard, event detail, command center, people, settings(appearance).
3. **Keep the `/organizer` route namespace.** ✅ Restyle inside it (do NOT move to `/console`).
   When importing demo `/console/*` markup, re-home under our existing `/organizer/*` routes.
4. **§1.5 reversal approved.** ✅ Landing stays locked light; app surfaces become
   theme-aware (light default). Rewrite the rule in the same PR as the theme code.

**Build order chosen:** Phase 1 (theme foundation) → Phase 2 (`/auth`) first.

---

## 10. Quick reference — source files worth opening

- Theme: `lib/peopld/theme/ThemeProvider.tsx`, `app/globals.css` (`.app-theme` block).
- Console: `components/peopld/console/{AppShell,ui,ThemeToggle,CommandPalette}.tsx`,
  `app/console/{page,events/page,events/new,events/[id],live,people,analytics,settings}`.
- Auth: `app/auth/page.tsx`.
- Attendee scenes: `app/event/page.tsx`, `components/peopld/event/scenes.tsx`.
- Data shapes (for reference only): `lib/peopld/{consoleData,eventData,data}.ts`.
</content>
</invoke>
