/**
 * Token → Tailwind-class maps. Lets data (content modules) pick a brand color by
 * NAME and let components turn it into a static, purge-safe class — so no hex and
 * no dynamic `bg-${x}` strings ever appear in components.
 * See docs/design/DESIGN_SYSTEM.md §1.
 */
import { COLORS } from "./colors";

/** Fills usable as a tile/section background. */
export type Fill =
  | "rose"
  | "gold"
  | "ice"
  | "lime"
  | "chlorine"
  | "coral"
  | "ember"
  | "plasma";

export const FILL_BG: Record<Fill, string> = {
  rose: "bg-rose",
  gold: "bg-gold",
  ice: "bg-ice",
  lime: "bg-lime",
  chlorine: "bg-chlorine",
  coral: "bg-coral",
  ember: "bg-ember",
  plasma: "bg-plasma",
};

/** Readable text color to use ON the matching fill. */
export const FILL_FG: Record<Fill, string> = {
  rose: "text-ink",
  gold: "text-ink",
  ice: "text-ink",
  lime: "text-ink",
  chlorine: "text-ink",
  coral: "text-white",
  ember: "text-white",
  plasma: "text-white",
};

/** Accent colors used for one emphasized word in a heading / an eyebrow. */
export type Accent = "coral" | "ember" | "plasma" | "lime" | "chlorine";

export const ACCENT_TEXT: Record<Accent, string> = {
  coral: "text-coral",
  ember: "text-ember",
  plasma: "text-plasma",
  lime: "text-lime",
  chlorine: "text-chlorine",
};

/** Re-export raw hex for the few spots that need a literal (avatars, gradients,
 * sample data) — still sourced from the single `colors.ts`. */
export const BRAND = COLORS;
