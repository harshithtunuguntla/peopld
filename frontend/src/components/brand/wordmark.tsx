import { cn } from "@/lib/utils";

type WordmarkProps = {
  /** Tile pixel size (default 28). The "p" glyph + wordmark scale from this. */
  size?: number;
  className?: string;
};

/**
 * The Peopld lockup as it appears in the app scenes: an ember (amber) rounded
 * tile with an italic "p", next to the wordmark. Distinct from `Logo` (the round
 * coral-dot mark used on the marketing landing) — this is the app-header
 * treatment. Tile is brand ember; the wordmark uses `text-foreground` so it
 * adapts to the active theme.
 */
export function Wordmark({ size = 28, className }: WordmarkProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative shrink-0 overflow-hidden rounded-lg bg-ember"
        style={{ width: size, height: size }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center font-display italic leading-none text-ink-950"
          style={{ fontSize: size * 0.56 }}
        >
          p
        </span>
      </div>
      <span className="font-display leading-none text-foreground" style={{ fontSize: size * 0.66 }}>
        Peopld
      </span>
    </div>
  );
}
