"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Small "(i)" affordance that reveals a one-line explanation of a metric on hover
 * (desktop) or tap (mobile/keyboard). Lives on the metric card so the whole card
 * stays clickable/clean and the definition is opt-in.
 */
export function InfoHint({ text, tone = "auto" }: { text: string; tone?: "auto" | "onColor" }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What does this mean?"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full transition-opacity",
          tone === "onColor" ? "opacity-60 hover:opacity-100" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 top-7 z-20 w-52 rounded-xl border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * Vivid bento metric tile (demo language) with an optional info hint. Used on the
 * dashboard overview and the post-event recap so the metric system is consistent.
 */
export function BentoTile({
  value,
  label,
  info,
  bg,
  fg,
  icon: Icon,
  delay = 0,
}: {
  value: number | string | null | undefined;
  label: string;
  info?: string;
  bg: string;
  fg: string;
  icon: React.ElementType;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className="relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-3xl p-5 sm:min-h-[140px]"
      style={{ background: bg, color: fg }}
    >
      <span className="pointer-events-none absolute -right-7 -top-7 h-20 w-20 rounded-full opacity-15" style={{ background: fg }} aria-hidden />
      <div className="relative flex items-start justify-between">
        <Icon className="h-5 w-5 opacity-80" aria-hidden />
        {info && <InfoHint text={info} tone="onColor" />}
      </div>
      <div className="relative">
        <div className="font-display text-[clamp(28px,5vw,44px)] leading-none tracking-[-0.04em]">
          {value === null || value === undefined ? "—" : typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="mt-1 text-sm opacity-80">{label}</div>
      </div>
    </motion.div>
  );
}
