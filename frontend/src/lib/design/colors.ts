/**
 * Raw brand hex — THE single source. Everything derives from this: tailwind
 * utility classes, the round system, and the token→class palette maps.
 * Never write a hex literal anywhere else. See docs/design/DESIGN_SYSTEM.md §1.
 *
 * Two contexts share these tokens:
 *  - LIGHT (marketing landing): paper canvas, ink text.
 *  - DARK  (attendee + organizer app): ink-950 canvas, cream text.
 */
export const COLORS = {
  // Light surface (landing)
  paper: "#F5F0E6",
  paper2: "#EDE6D6",
  ink: "#0F0E14", // near-black, violet undertone
  ink2: "#1B1A22", // raised dark surface on light pages

  // Dark surface scale (app)
  ink950: "#06060A",
  ink900: "#0A0A12",
  ink800: "#0F0E18",
  ink700: "#16142A",
  ink600: "#1F1B33",
  cream: "#F4EFE4", // body text on dark

  // Accent / round palette (shared across contexts)
  coral: "#FF5A3C", // primary brand accent
  ember: "#FF4E2B", // coral tuned hotter for dark bg + aurora/glow
  lime: "#D9FF4D", // AI gift / icebreaker accent (landing)
  plasma: "#B66CFF", // round 2 / purple
  chlorine: "#A8FF7A", // round 3 / vivid AI green
  leaf: "#7CC265", // muted green for light-bg text
  gold: "#F5C16C", // round 4
  ice: "#A8D5FF", // round 5
  rose: "#FFB5A8", // soft coral tile
} as const;

export type ColorName = keyof typeof COLORS;
