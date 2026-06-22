import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PillTone } from "@/lib/design/status";

/**
 * The one status pill, in the demo's language: a saturated dot + saturated text
 * on a ~14% tint of the same color. Used for every state across the app so a
 * status looks identical everywhere. Pass a `PillTone` from lib/design/status.
 *
 * `solid` is the OVER-COVER variant: an opaque, theme-aware surface with
 * foreground text + a colored dot, so the label stays legible on top of a vivid
 * cover band or a photo (where the 14% tint washes out). It keeps the status
 * COLOR via the dot but never relies on the tint for contrast.
 */
export function StatusPill({
  tone,
  label,
  pulse = false,
  uppercase = false,
  solid = false,
  className,
}: {
  tone: PillTone;
  label: ReactNode;
  /** Animate the dot (e.g. a live / happening-now state). */
  pulse?: boolean;
  uppercase?: boolean;
  /** Opaque, high-contrast variant for placing on a cover image / color band. */
  solid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        uppercase && "uppercase tracking-wide",
        solid && "glass-chip font-semibold text-foreground",
        className,
      )}
      style={solid ? undefined : { color: tone.fg, background: tone.bg }}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", pulse && "animate-pulse")}
        style={{ background: tone.dot }}
        aria-hidden
      />
      {label}
    </span>
  );
}
