/**
 * Deterministic initials-avatar coloring. A real attendee with no profile photo
 * gets a SINGLE solid brand color (no gradient mix), picked stably from a seed
 * (their id) so the same person always looks the same everywhere — live screen,
 * rolodex, organizer console. This matches the landing-page roster vibe (the
 * "38 already inside" avatars), which use one solid brand color each.
 *
 * This is the single source for app avatar coloring. Do NOT re-implement the
 * hash per-page (it used to be copy-pasted in 4 files).
 */
import { COLORS } from "./colors";

/**
 * The exact single-color set the landing avatars cycle through
 * (see lib/content/landing.ts) — solid brand colors, no gradients.
 */
const PALETTE = [
  COLORS.coral,
  COLORS.chlorine,
  COLORS.plasma,
  COLORS.gold,
  COLORS.ice,
] as const;

/** djb2-ish stable hash → unsigned int. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Relative luminance (0..1) of a #rrggbb hex. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export type AvatarColor = {
  /** Solid brand color for `background`. */
  css: string;
  /** Readable foreground (#fff or near-black) for the initials. */
  ink: string;
};

/**
 * One solid brand color, picked stably from the seed. Same person → same color
 * everywhere; light fills (chlorine/gold/ice) get near-black initials, the rest
 * get white — matching the landing avatars exactly.
 */
export function avatarColor(seed: string): AvatarColor {
  const c = PALETTE[hash(seed) % PALETTE.length];
  return { css: c, ink: luminance(c) > 0.62 ? COLORS.ink900 : "#FFFFFF" };
}
