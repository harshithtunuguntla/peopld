import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Decorative glyph rendered inside the field's leading edge (e.g. a brand mark). */
  startIcon?: React.ReactNode;
}

/**
 * Token-driven text input. Works on light (organizer) and dark (attendee)
 * surfaces automatically via semantic shadcn tokens — no per-screen colors.
 * `h-12` (48px) clears the 44px touch target; `text-base` (16px) prevents iOS
 * auto-zoom on focus. Pass `startIcon` for a leading brand glyph. See
 * DESIGN_SYSTEM.md §6.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", startIcon, ...props }, ref) => {
    const base = cn(
      "flex h-12 w-full rounded-xl border border-input bg-secondary/50 text-base text-foreground",
      "placeholder:text-muted-foreground transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/50",
    );

    if (!startIcon) {
      return <input ref={ref} type={type} className={cn(base, "px-4", className)} {...props} />;
    }

    // Icon overlay: the input keeps the border/focus ring; the glyph sits inside
    // with extra left padding so text never collides with it.
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {startIcon}
        </span>
        <input ref={ref} type={type} className={cn(base, "pl-11 pr-4", className)} {...props} />
      </div>
    );
  },
);
Input.displayName = "Input";
