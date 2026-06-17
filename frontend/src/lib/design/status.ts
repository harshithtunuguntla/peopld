/**
 * ONE source for status / phase visuals, so a state reads identically across the
 * whole app (people, events, connections, live). The pill language is brought
 * directly from demo-workup-ui (components/peopld/console/ui.tsx `STATUS_STYLE`):
 * a saturated DOT + saturated TEXT on a ~14% tint of the same color. Those fixed
 * mid-tone hexes are readable in BOTH light & dark (exactly as the demo ships
 * them), so pills don't need theme-token gymnastics.
 *
 * KPI tiles are a different component (big solid fills, like the demo's KPI
 * strip) — those use the bright brand hexes from lib/design/colors.ts.
 */
import { COLORS } from "./colors";

/** Big solid KPI tile fills (people page) — bright, like the demo KPI strip. */
export const ATTENDEE_STATUS_HEX: Record<"arrived" | "registered" | "total", string> = {
  arrived: COLORS.chlorine, // present / in the room
  registered: COLORS.amber, // not here yet
  total: COLORS.sky, // everyone registered
};

/** A pill tone = the three colors a demo chip needs. */
export type PillTone = { fg: string; bg: string; dot: string };

/** The demo's exact pill tones (console/ui.tsx). */
export const TONE = {
  positive: { fg: "#3FA34D", bg: "rgba(63,163,77,0.14)", dot: "#3FA34D" }, // live / arrived / here
  pending: { fg: "#E0533D", bg: "rgba(255,90,60,0.14)", dot: "#FF5A3C" }, // upcoming / not here yet
  info: { fg: "#4F92C9", bg: "rgba(111,182,240,0.14)", dot: "#6FB6F0" }, // done / ended
  neutral: { fg: "#9B96A6", bg: "rgba(155,150,166,0.14)", dot: "#9B96A6" }, // draft / left / gone
} satisfies Record<string, PillTone>;

/** Attendee check-in status → tone. */
export const ATTENDEE_TONE: Record<"arrived" | "registered" | "left", PillTone> = {
  arrived: TONE.positive,
  registered: TONE.pending,
  left: TONE.neutral,
};

/** Event lifecycle phase → label, tone, and a glow hex for the card accent. */
export const EVENT_PHASE: Record<
  "now" | "upcoming" | "ended",
  { label: string; tone: PillTone; glow: string }
> = {
  now: { label: "Happening now", tone: TONE.positive, glow: TONE.positive.dot },
  upcoming: { label: "Upcoming", tone: TONE.pending, glow: TONE.pending.dot },
  ended: { label: "Ended", tone: TONE.info, glow: TONE.info.dot },
};

/** "You're registered / in / checked-in" affirmation → positive tone. */
export const REGISTERED_TONE = TONE.positive;
