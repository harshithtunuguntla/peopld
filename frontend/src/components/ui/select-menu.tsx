"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A small custom dropdown that replaces the native `<select>`.
 *
 * Why not a native select: on most platforms the open list renders with the OS's
 * own styling — including a hard blue highlight on the active option — which
 * clashes with the app's theme (the pilot feedback). This renders the menu as our
 * own popover so the selected/hover states use the accent token and read on both
 * light and dark. Closes on outside click and Escape; the trigger is a real
 * button so keyboard + screen readers work.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  menuClassName,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm text-foreground transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="max-w-[160px] truncate">{current?.label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute right-0 z-30 mt-2 max-h-72 w-56 overflow-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl",
            menuClassName,
          )}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    selected ? "bg-accent/15 font-medium text-accent" : "hover:bg-muted",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
