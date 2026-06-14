import * as React from "react";
import { cn } from "@/lib/utils";

/** Token-driven multiline input — same conventions as {@link Input}. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "flex w-full rounded-xl border border-input bg-secondary/50 px-4 py-3 text-base text-foreground",
        "placeholder:text-muted-foreground transition-colors resize-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
