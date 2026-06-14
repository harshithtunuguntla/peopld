# Peopld — Design System

> The single source of truth for how Peopld looks and feels. Every page and
> component is built against this document. If a rule here and the code disagree,
> the code is wrong — fix the code (or change this doc deliberately, in the same PR).

Distilled from the approved visual prototype (`ui-emergent/demo-workup-ui`, the
"aurora editorial" `/v1` build). The prototype is a **design reference, not code to
import** — it carries inline hex everywhere and two divergent palettes. We keep its
*language* (boarding-pass metaphor, color-per-round, editorial type, the cinematic
motion layer) and rebuild it as small, typed, reusable components wired to real data.

---

## 0. Non-negotiables (read first)

1. **One source per token.** Raw hex lives ONLY in `src/lib/design/colors.ts`.
   `tailwind.config.ts`, `rounds.ts`, and `palette.ts` all import from it. **No hex
   literal in any component.** Need a color? Use a Tailwind class (`bg-coral`), a
   `Round` object, or a `palette` map — never `#…` in a `.tsx`.
2. **Mobile-first.** Author for 375px, scale up with `sm:`/`lg:`. Excellent on a
   phone *and* a laptop. Big type uses fluid `clamp()` so it never overflows.
3. **Modular & reusable.** Recurring UI is a typed, props-driven component with no
   baked-in data. Pages compose; they don't redraw.
4. **Accessible by default.** Contrast, focus rings, 44px targets, and
   `prefers-reduced-motion` — paid down as we build, never deferred.

---

## 1. Color

### 1.1 The single source

All hex lives in `src/lib/design/colors.ts` (`COLORS`). Two contexts share it:

**Light — the marketing landing.**

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F0E6` | Page background |
| `paper2` | `#EDE6D6` | Banded section background |
| `ink` | `#0F0E14` | Foreground / near-black |
| `ink2` | `#1B1A22` | Raised dark surface on light |

**Dark — the attendee + organizer app (and the landing's ScenesGallery island).**

| Token | Hex | Use |
|---|---|---|
| `ink950` | `#06060A` | App background (`bg-ink-950`) |
| `ink900` | `#0A0A12` | Elevated dark surface |
| `ink800/700/600` | `#0F0E18 / #16142A / #1F1B33` | Deeper surfaces |
| `cream` | `#F4EFE4` | Foreground on dark (`text-cream`) |

**Accent / round family (shared across both contexts).**

| Token | Hex | Foreground on it |
|---|---|---|
| `coral` | `#FF5A3C` | white — primary brand accent |
| `ember` | `#FF4E2B` | white — coral tuned hotter for dark (aurora, glow, dark CTAs) |
| `lime` | `#D9FF4D` | ink — AI gift / icebreaker (landing) |
| `chlorine` | `#A8FF7A` | ink — vivid AI green (dark icebreaker) |
| `plasma` | `#B66CFF` | white — round 2 / purple |
| `gold` | `#F5C16C` | ink — round 4 |
| `ice` | `#A8D5FF` | ink — round 5 |
| `leaf` | `#7CC265` | — muted green for green text on light bg |
| `rose` | `#FFB5A8` | ink — soft tile |

Tailwind exposes all of these as utilities (`bg-coral`, `text-cream`, `bg-ink-950`,
`border-ink/10`, …). The shadcn semantic tokens (`background`, `foreground`,
`primary`, `ring`, …) are HSL CSS variables in `globals.css` — `:root` is light,
`.dark` is dark.

### 1.2 The round system

A round = **color + contrasting ink + name**, defined once in
`src/lib/design/rounds.ts`. The prototype shipped two divergent round palettes
(landing vs app); **we unified them into one canonical set** with correct contrast:

```ts
ROUNDS = [ coral, plasma, chlorine, gold, ice ]   // names: Origins, …, Open table
roundFor(i)  // rounds repeat past 5
```

Round **names** are demo placeholders; real names come from event data. The colors
are the durable system — used by `BoardingPass`, the reveal, the live header, the
organizer "next round" card, and the timeline spine.

### 1.3 Contrast helper

Never eyeball text-on-color. `inkOn(hex)` returns near-black for light fills (lime,
chlorine, gold, ice, leaf, rose, cream) and white otherwise. `Avatar`, boarding
passes, and round chips all use it.

### 1.4 Token → class maps

`src/lib/design/palette.ts` maps a color *name* to a static, purge-safe class
(`FILL_BG`, `FILL_FG`, `ACCENT_TEXT`). This lets content modules pick a color by
token and keeps `bg-${dynamic}` strings and hex out of components.

---

## 2. Light vs dark (where each lives)

| Surface | Mode | Why |
|---|---|---|
| **Landing / marketing** | Light (paper/ink) | Warm, editorial, inviting |
| **Landing ScenesGallery** | **Dark island** (ink-950 + aurora) | A framed "step inside" preview of the app |
| **Attendee app** (join → waiting → reveal → live → recap) | **Dark** | Dark-venue friendly; vivid round colors pop |
| **Organizer command center** | **Dark** | Control-room feel; live data reads better on dark |

Dark is applied with the `dark` class on the route wrapper (shadcn) or, for the
ScenesGallery island, explicit `bg-ink-950 text-cream` scoped to the section. The
reveal screen briefly floods its background with the round color — intentional.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| **Display** | Fraunces (serif, `font-display`) | Headlines, table numbers, the boarding pass. `next/font`, `style:[normal,italic]` — italic display in an accent color is the signature emphasis (one phrase per heading). |
| **Body / UI** | Inter (`font-sans`, default) | Paragraphs, labels, buttons, nav. |
| **Mono** | JetBrains Mono (`font-mono`) | Countdown timers + timeline ticks (`tabular-nums`). |

**Fluid scale** — headlines use `clamp()` so they never overflow on small screens:
- Hero H1 `text-[clamp(48px,7.5vw,118px)]`
- Section H2 `text-5xl sm:text-7xl` (or `clamp(36px,5.5vw,76px)`)
- Card H3 `text-2xl`–`text-3xl`
- Body `text-[clamp(15px,1.15vw,18px)]` / `text-sm`
- **Eyebrow**: `text-[11px] uppercase tracking-[0.3em]`, accent-colored, prefixed
  `/ ` (e.g. `/ The problem`) — the `SectionLabel` component.

Pair headlines with `text-balance`, body with `text-pretty`.

---

## 4. Layout, spacing, shape

- **Container:** `max-w-[1320px] mx-auto px-6 sm:px-8` (landing + organizer).
- **Attendee column:** full-bleed on phone; centered narrow column on larger
  screens. The `PhoneFrame` device mock is **marketing-only** (ScenesGallery) —
  never wrap a real shipped attendee route in it.
- **Section rhythm:** `py-24 sm:py-32`. Banded/island sections use big rounded
  corners (`rounded-[40px]`).
- **Radius:** pills `rounded-full`; cards `rounded-2xl`/`rounded-3xl`; boarding
  pass `rounded-[28px]` (hero uses fluid `clamp`). Driven off `--radius` where possible.
- **Hairlines/fills:** light → `border-ink/10`, `bg-ink/[0.04]`; dark →
  `border-white/10`, `bg-white/[0.03]`.

### 4.1 Responsive patterns (mobile)

- **Headline-first hero.** On mobile the copy/headline comes *before* the visual
  (`order-1` copy, `order-2` artwork); on desktop they sit left/right.
- **Interactive two-pane sections** (a picker + a preview, e.g. ScenesGallery) use
  **horizontal tabs above the content on mobile** (so options + preview are visible
  together) and a vertical list beside it on desktop.
- **Big display headlines use fluid `clamp()`** with a looser `leading` on small
  screens so long wrapped lines don't crush together.
- **Device/preview mocks** (`PhoneFrame`) carry `max-w-full` so they shrink to fit a
  narrow viewport instead of overflowing.
- Decorative absolute elements peek **less** on mobile (`-left-[12%] sm:-left-[24%]`)
  so they don't clip off the edge.

### 4.2 Forms

- Always compose with `Field` + `Input`/`Textarea` — never a raw `<input>`. Every
  field has a **visible label** (not placeholder-only); placeholders are examples.
- Inputs are `h-12` (≥44px target) and `text-base` (16px — stops iOS auto-zoom).
  Use the right `type`/`inputMode`/`autoComplete` (`email`, `tel`, `url`,
  `one-time-code`) so mobile shows the correct keyboard and can autofill.
- **Validate on submit**, show the error **directly below the field**, and move
  focus to the first invalid field. Required fields show `*`; optional fields are
  labelled "Optional" rather than left ambiguous.
- Async submit: disable the button and show a spinner; surface server errors in an
  `role="alert"` banner. The single primary action uses `variant="accent"` +
  `glow-ember` on dark.

---

## 5. Texture & motion

**Texture utilities:** `grid-paper` / `grid-paper-light` (faint rules), `grain-bg`
(film grain), `glow-ember` (CTA glow on dark), `mask-fade-edges` (marquee edges),
`scrollbar-hide`. Atmosphere, not decoration — use sparingly.

**Motion layer** (framer-motion + GSAP). Every animation has a reduced-motion path.

| Primitive | Lib | Reduced-motion |
|---|---|---|
| `SplitReveal` | GSAP | renders static text |
| `RevealOnScroll` | GSAP + IntersectionObserver | renders static |
| `CountUp` | GSAP | shows final value |
| `TiltCard` | framer | flat (also flat on touch) |
| `MagneticButton` | framer | static button |
| `AuroraBackground` | rAF | one static gradient |
| `HeroBoardingPass` / `AIGiftCard` | framer | no entrance/tilt |

CSS loops (`marquee`, `pulse-soft`, `spin-slow`, `shimmer`) are paused by the global
`prefers-reduced-motion` media query in `globals.css`. JS animations additionally
guard via framer's `useReducedMotion()` or `prefersReducedMotion()`
(`src/lib/design/motion.ts`).

---

## 6. Component inventory

Reusable building blocks in `src/components/`. Typed props, zero baked-in content.

**`ui/`** — `button` (CVA pill: variants default/accent/outline/ghost/paper +
dark variants; `buttonVariants` to style a `<Link>`). `Input`, `Textarea`,
`Field` — token-driven form primitives that resolve to light **or** dark variants
automatically via semantic shadcn tokens (`bg-secondary`, `border-input`,
`text-foreground`), so the same controls work on the organizer (light) and
attendee (dark) surfaces. `Field` owns the label↔control wiring, optional hint,
inline error placement, and ARIA (`aria-invalid`, `aria-describedby`,
`role="alert"`) via a render-prop.

**`auth/`** — onboarding building blocks: `AuthShell` (the branded dark backdrop
for every onboarding screen — applies the `dark` token context, aurora + grid,
centred card, optional event-context header), `SignInPanel` (Google + email-OTP,
wired to Supabase Auth), `RegisterForm` (attendee profile form; owns its state +
client validation, emits clean values).

**`brand/`** — `Logo`, `Avatar`, `AvatarStack`, `SectionLabel`, `MarqueeStrip`,
`StatCard`, `IcebreakerCard`, `BoardingPass` (dark app context), `HeroBoardingPass`
(fluid light hero), `AIGiftCard`, `PhoneFrame` (marketing only), plus the motion
primitives in §5.

**`landing/`** — section components: `LandingNav`, `Hero`, `LogoStrip`,
`ProblemSection`, `HowItWorks`, `ScenesGallery` (+ `scenes.tsx` preview screens),
`Timeline`, `FinalCta`, `SiteFooter`, composed by `app/page.tsx`.

---

## 7. Accessibility checklist (every page passes before review)

- [ ] Contrast ≥ 4.5:1 (use `inkOn`; no coral body text on paper).
- [ ] Visible focus: `focus-visible:ring-2 ring-ring ring-offset-2`.
- [ ] Tap targets ≥ 44px (buttons `h-10`–`h-14`).
- [ ] Real `<button>`/`<a>` with labels; icon-only buttons get `aria-label`;
      decorative visuals get `aria-hidden`.
- [ ] `prefers-reduced-motion` honored (see §5).
- [ ] Inputs have `<label>`; forms keyboard-navigable.

---

## 8. Tech foundation

- **Next.js 15 + React 19 + TypeScript** (our `frontend/`). The prototype's Next 14
  / React 18 / JS is not carried over.
- **Fonts:** `next/font/google` → Inter, Fraunces, JetBrains Mono (`--font-*`).
  (The prototype's extra display faces — DM Serif, Cormorant, Bebas — are omitted for
  performance; add only if a page needs one.)
- **Styling:** Tailwind 3 + the token layer + `tailwindcss-animate`.
- **Animation/icons:** `framer-motion`, `gsap`, `lucide-react`. Helpers: `cn()`.
- **Do NOT carry over:** the prototype's MongoDB API route, react-query provider, or
  scene-switcher nav. Pages wire to **our** backend (`src/lib/api.ts` + Supabase).

---

## 9. Build order (page by page)

Each page: build modularly → user reviews live → next. Real data where the backend
supports it; mock only where it doesn't yet.

1. **Foundation** — this doc, tokens, fonts, motion primitives, base components. ✅
2. **Landing** (light, full marketing + dark ScenesGallery island). ✅
3. **Join / register** (dark, real auth). ✅
4. **Waiting room** (dark, realtime).
5. **Round reveal** (dark, the wow moment).
6. **Live dashboard** (dark, real `/live` + icebreaker).
7. **Recap / connections** (dark, real rolodex).
8. **Organizer command center** (dark, real control).

The marketing preview scenes in `landing/scenes.tsx` are throwaway mocks; the real
pages above are separate and reuse the brand components.

---

_Changes to this system are intentional and reviewed. Update this file in the same
PR as the code that changes a rule._
