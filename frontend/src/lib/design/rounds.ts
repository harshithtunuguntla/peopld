/**
 * The round color system — Peopld's signature color-per-round identity, derived
 * from the single source in `colors.ts`. See docs/design/DESIGN_SYSTEM.md §1.2.
 *
 * NOTE: the visual prototype shipped two divergent round palettes (one for the
 * landing, one for the app scenes). We unify them here into ONE canonical set
 * with proper text contrast. Never hardcode hex in components — read a `Round`.
 */
import { COLORS } from "./colors";

export type Round = {
  key: string;
  /** Vivid fill for the round (boarding pass, reveal, live header). */
  bg: string;
  /** Contrasting foreground for text/icons on `bg`. */
  ink: string;
  /** Display name. Demo placeholder — real names come from event data. */
  name: string;
};

export const ROUNDS: Round[] = [
  { key: "coral", bg: COLORS.coral, ink: "#FFFFFF", name: "Origins" },
  { key: "plasma", bg: COLORS.plasma, ink: "#FFFFFF", name: "What you are building" },
  { key: "chlorine", bg: COLORS.chlorine, ink: COLORS.ink900, name: "Bold opinions" },
  { key: "gold", bg: COLORS.gold, ink: COLORS.ink900, name: "Help wanted" },
  { key: "ice", bg: COLORS.ice, ink: COLORS.ink900, name: "Open table" },
];

/** Rounds repeat past the palette length — round 6 reuses the first color. */
export const roundFor = (index: number): Round => ROUNDS[index % ROUNDS.length];

/**
 * A round resolved for a specific event: same canonical color identity, but the
 * NAME comes from the organizer-authored agenda (`event.round_topics`) when set,
 * falling back to a plain "Round N". `index` is 0-based.
 *
 * Rounds are random reshuffles, not themed segments, so the default label is the
 * honest "Round N" — organizers can still name a round in Settings when they
 * genuinely want a theme (that authored name wins here).
 */
export const agendaFor = (index: number, topics?: string[] | null): Round => {
  const base = roundFor(index);
  const authored = topics?.[index]?.trim();
  return { ...base, name: authored || defaultRoundName(index) };
};

/** The default round label — a plain, honest "Round N" (1-based). Used as the
 *  agenda fallback and as the placeholder in the round-naming editor. */
export const defaultRoundName = (index: number): string => `Round ${index + 1}`;

/** Light fills that need near-black text instead of white. */
const LIGHT_FILLS = new Set<string>([
  COLORS.lime,
  COLORS.chlorine,
  COLORS.leaf,
  COLORS.gold,
  COLORS.ice,
  COLORS.rose,
  COLORS.cream,
]);

/** Pick a readable foreground for any brand fill. See DESIGN_SYSTEM §1.3. */
export const inkOn = (hex: string): string =>
  LIGHT_FILLS.has(hex) ? COLORS.ink900 : "#FFFFFF";
