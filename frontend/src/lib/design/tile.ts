/**
 * Dark-mode skin for big SOLID colour tiles (KPI stats, recap stats). The bright
 * brand fills (chlorine/amber/sky/coral…) look great on the light cream canvas,
 * but on the near-black dark canvas a light, fully-saturated fill "glows" and
 * vibrates (a classic dark-mode pitfall — see DESIGN_SYSTEM §1; UI guideline
 * `color-dark-mode`: dark mode needs desaturated/tonal variants, not the same
 * colour). `darkTile` turns any bright fill into a DEEP, desaturated card of the
 * same hue with BRIGHT same-hue text — calm, on-brand, and high-contrast by
 * construction (fill L≈18% vs text L≈82%, comfortably AA for the big numbers and
 * their labels). Hue-preserving so a green stat still reads green, etc.
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue (0–360) of a hex — that's all the dark skin needs from the source colour. */
function hueOf(hex: string): number {
  let [r, g, b] = hexToRgb(hex);
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0; // grey — hue irrelevant
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d) % 6;
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export interface TileSkin {
  /** Deep desaturated fill for the dark canvas. */
  bg: string;
  /** Bright same-hue text/number colour that reads on `bg`. */
  ink: string;
}

/** Deep dark-mode tile skin (fill + ink) derived from a bright brand fill. */
export function darkTile(hex: string): TileSkin {
  const h = Math.round(hueOf(hex));
  return {
    bg: `hsl(${h} 42% 17%)`,
    ink: `hsl(${h} 88% 82%)`,
  };
}
