/**
 * ONE source for status / phase visuals, so a state reads identically and
 * vibrantly on every surface (people KPIs + row pills, event cards). Demo-level
 * intensity: solid brand fills for the meaningful states, quiet neutral for the
 * "gone / ended" states.
 *
 * Every color comes from lib/design/colors.ts (via tailwind utilities for class
 * strings, or COLORS hex for inline `style` fills) — never a raw literal here.
 * Because the app has a light/dark toggle, pills pair a FIXED brand hex with a
 * FIXED contrast ink (e.g. amber + ink-900) so they're readable in BOTH modes.
 */
import { COLORS } from "./colors";

/** Canonical fill per attendee status — used by the KPI tiles (inline hex). */
export const ATTENDEE_STATUS_HEX: Record<"arrived" | "registered" | "total", string> = {
  arrived: COLORS.chlorine, // present / in the room — vivid green
  registered: COLORS.amber, // not here yet — vivid marigold
  total: COLORS.sky, // everyone registered — vivid blue
};

/** Matching pill classes for the per-person status chip (same colors as above). */
export const ATTENDEE_STATUS_PILL: Record<"registered" | "arrived" | "left", string> = {
  arrived: "bg-chlorine text-ink-900",
  registered: "bg-amber text-ink-900",
  left: "bg-muted text-muted-foreground line-through",
};

/** Event lifecycle phase → vibrant pill + a glow hex for the card accent. */
export const EVENT_PHASE: Record<
  "now" | "upcoming" | "ended",
  { label: string; pill: string; glow: string }
> = {
  now: { label: "Happening now", pill: "bg-ember text-white", glow: COLORS.ember },
  upcoming: { label: "Upcoming", pill: "bg-sky text-ink-900", glow: COLORS.sky },
  ended: { label: "Ended", pill: "bg-muted text-muted-foreground", glow: COLORS.ink600 },
};

/** "You're registered" affirmation chip — same vivid green as 'arrived'. */
export const REGISTERED_CHIP = "bg-chlorine text-ink-900";
