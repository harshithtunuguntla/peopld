import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Token-driven text input. Works on light (organizer) and dark (attendee)
 * surfaces automatically via semantic shadcn tokens — no per-screen colors.
 * `h-12` (48px) clears the 44px touch target; `text-base` (16px) prevents iOS
 * auto-zoom on focus. See DESIGN_SYSTEM.md §6.
 */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-12 w-full rounded-xl border border-input bg-secondary/50 px-4 text-base text-foreground",
        "placeholder:text-muted-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
