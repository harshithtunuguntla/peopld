"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const TIP_WIDTH = 224; // px — clamped to the viewport on small screens
const GAP = 8;

/**
 * Small "(i)" affordance that reveals a one-line explanation of a metric on hover
 * (desktop) or tap (mobile/keyboard). The popover is rendered into a body-level
 * portal with fixed positioning so it can NEVER be clipped by an ancestor's
 * `overflow-hidden` (the metric tiles use rounded `overflow-hidden`, which used to
 * shave off most of the tooltip). Position is measured from the trigger and
 * clamped/flipped to stay fully on-screen at any width.
 */
export function InfoHint({ text, tone = "auto" }: { text: string; tone?: "auto" | "onColor" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(TIP_WIDTH, vw - 2 * GAP);
    // Right-align with the trigger, then clamp inside the viewport.
    const left = Math.min(Math.max(r.right - width, GAP), vw - width - GAP);
    // Default below; flip above if the measured tip would overflow the bottom.
    const tipH = tipRef.current?.offsetHeight ?? 0;
    const below = r.bottom + GAP;
    const top = tipH && below + tipH > vh - GAP ? r.top - GAP - tipH : below;
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place(); // first pass: tip not in DOM yet → positions below
    // second pass after the tip has rendered → real height is known → flip if needed
    const raf = requestAnimationFrame(place);
    const onScroll = () => place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (btnRef.current?.contains(e.target as Node) || tipRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, place]);

  return (
    <span
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label="What does this mean?"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-opacity",
          tone === "onColor" ? "opacity-70 hover:opacity-100" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && mounted && pos &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[80] rounded-xl border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-lg"
          >
            {text}
          </span>,
          document.body,
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
