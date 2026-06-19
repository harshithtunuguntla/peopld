import { COLORS } from "./colors";

/**
 * Event card cover: an uploaded image URL when set, else a DETERMINISTIC color
 * derived from the event id — stable across refreshes and devices (never random),
 * so a card is never blank. Mirrors how the rounds get their themed colors.
 */
export interface EventCover {
  bg: string;
  ink: string; // text/icon color that reads on bg
}

// Curated vivid pairs (bg + a readable ink). Saturated mid-darks take white ink;
// the lighter pastels take near-black.
const PALETTE: EventCover[] = [
  { bg: COLORS.coral, ink: "#FFFFFF" },
  { bg: COLORS.plasma, ink: "#FFFFFF" },
  { bg: "#2BB6A3", ink: "#FFFFFF" },
  { bg: "#3FA34D", ink: "#FFFFFF" },
  { bg: COLORS.sky, ink: COLORS.ink },
  { bg: COLORS.gold, ink: COLORS.ink },
  { bg: COLORS.amber, ink: COLORS.ink },
  { bg: COLORS.rose, ink: COLORS.ink },
];

/** FNV-1a — small, stable, well-distributed string hash. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function eventColor(id: string): EventCover {
  return PALETTE[hash(id) % PALETTE.length];
}
