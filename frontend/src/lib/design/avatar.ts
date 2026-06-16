/**
 * Deterministic initials-avatar gradients. A real attendee with no profile
 * photo gets a *two-color* brand gradient (not one flat fill), picked stably
 * from a seed (their id) so the same person always looks the same everywhere —
 * live screen, rolodex, organizer console. See DESIGN_SYSTEM §1.2.
 *
 * This is the single source for app avatar coloring. Do NOT re-implement the
 * hash per-page (it used to be copy-pasted in 4 files).
 */
import { COLORS } from "./colors";

const PALETTE = [
  COLORS.coral,
  COLORS.plasma,
  COLORS.gold,
  COLORS.ice,
  COLORS.chlorine,
  COLORS.rose,
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

export type AvatarGradient = {
  /** Ready-to-use CSS `linear-gradient(...)` for `background`. */
  css: string;
  /** Readable foreground (#fff or near-black) for the initials. */
  ink: string;
};

/**
 * Two distinct brand colors + a seeded angle → a stable gradient. The second
 * color is guaranteed different from the first, so every avatar reads as
 * multi-color rather than a single flat tile.
 */
export function avatarGradient(seed: string): AvatarGradient {
  const h = hash(seed);
  const len = PALETTE.length;
  const i = h % len;
  // step is 1..len-1, so j is always a different index from i.
  const step = 1 + (Math.floor(h / len) % (len - 1));
  const j = (i + step) % len;
  const from = PALETTE[i];
  const to = PALETTE[j];
  const angle = 90 + (h % 180); // 90..269deg — varied but never washed-out flat
  return {
    css: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`,
    // Average the two ends; if the blend is light, use near-black initials.
    ink: (luminance(from) + luminance(to)) / 2 > 0.62 ? COLORS.ink900 : "#FFFFFF",
  };
}
