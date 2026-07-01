"use client";

import { cn } from "@/lib/utils";

/**
 * A small accessible on/off switch (real <button role="switch">, keyboard +
 * screen-reader friendly). Used for opt-in toggles like "let everyone at this
 * event see my phone number". Mobile-first: the track is a 44px-wide tap target.
 */
export function Switch({
  checked,
  onChange,
  id,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        checked ? "border-accent bg-accent" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-[3px]",
        )}
        aria-hidden
      />
    </button>
  );
}
