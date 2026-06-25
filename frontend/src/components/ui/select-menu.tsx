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
  // Which edge the menu anchors to. We pick whichever keeps it inside the
  // viewport: the trigger can end up near either edge (it wraps onto its own
  // line on mobile), and a fixed `right-0` would push the menu off-screen to
  // the left when the trigger sits at the left edge (the pilot bug).
  const [alignEnd, setAlignEnd] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  const MENU_WIDTH = 224; // keep in sync with the w-56 cap below

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen && ref.current) {
        // Prefer aligning the menu's left edge to the trigger (opens rightward).
        // If that would overflow the right edge, anchor to the right instead.
        const rect = ref.current.getBoundingClientRect();
        const overflowsRight = rect.left + MENU_WIDTH > window.innerWidth - 8;
        setAlignEnd(overflowsRight);
      }
      return !wasOpen;
    });
  }

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
        onClick={toggle}
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
            "absolute z-30 mt-2 max-h-72 w-[min(14rem,calc(100vw-1.5rem))] overflow-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl",
            alignEnd ? "right-0" : "left-0",
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
