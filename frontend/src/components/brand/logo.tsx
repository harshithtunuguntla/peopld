import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/design/colors";

type LogoProps = {
  /** Pixel diameter (default 36). The glyph + dot scale from this. */
  size?: number;
  /** Render for a dark background. */
  dark?: boolean;
  className?: string;
};

/** The Peopld mark — a round serif "p" tile. A single, consistent letterform
 *  (no status dot) used everywhere the mark appears. */
export function Logo({ size = 36, dark = false, className }: LogoProps) {
  const tile = dark ? COLORS.cream : COLORS.ink;
  const glyph = dark ? COLORS.ink : COLORS.paper;
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ background: tile, width: size, height: size }}
      aria-hidden
    >
      <span className="font-display italic leading-none" style={{ color: glyph, fontSize: size * 0.56 }}>
        p
      </span>
    </div>
  );
}
