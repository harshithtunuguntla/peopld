import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PillTone } from "@/lib/design/status";

/**
 * The one status pill, in the demo's language: a saturated dot + saturated text
 * on a ~14% tint of the same color. Used for every state across the app so a
 * status looks identical everywhere. Pass a `PillTone` from lib/design/status.
 */
export function StatusPill({
  tone,
  label,
  pulse = false,
  uppercase = false,
  className,
}: {
  tone: PillTone;
  label: ReactNode;
  /** Animate the dot (e.g. a live / happening-now state). */
  pulse?: boolean;
  uppercase?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        uppercase && "uppercase tracking-wide",
        className,
      )}
      style={{ color: tone.fg, background: tone.bg }}
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
