"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";

import { Avatar } from "@/components/brand/avatar";
import { type Round } from "@/lib/design/rounds";
import { cn } from "@/lib/utils";
import type { Seat } from "./types";

// --- A circular countdown ring (demo-style), driven by the real remaining secs. ---
export function TimerRing({
  remaining,
  total,
  color,
  paused = false,
}: {
  remaining: number | null;
  total: number;
  color: string;
  paused?: boolean;
}) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const pct = remaining === null || total <= 0 ? 1 : Math.max(0, Math.min(1, remaining / total));
  const low = !paused && remaining !== null && remaining <= 30;
  const mm = remaining === null ? "--" : String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = remaining === null ? "--" : String(remaining % 60).padStart(2, "0");
  const ringColor = paused ? "hsl(var(--warning))" : color;
  return (
    <div className="relative h-24 w-24 shrink-0" role="timer" aria-live="polite">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ opacity: paused ? 0.6 : 1 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-mono text-lg tabular-nums", paused ? "text-warning" : low ? "text-accent" : "text-foreground")}>
          {mm}:{ss}
        </span>
        <span className="text-[9px] uppercase tracking-widest text-foreground-subtle">
          {paused ? "paused" : "left"}
        </span>
      </div>
    </div>
  );
}

// --- The floor map ---
// A spatial grid of tables (like standing in the room). Each tile is colored by
// how full it is, and tapping one reveals exactly who is seated there. A seat
// finder lets the organizer locate any person on the floor in one tap.
export function FloorMap({
  tables,
  theme,
  seatsPerTable,
}: {
  tables: { table_number: number; seats: Seat[] }[];
  theme: Round;
  seatsPerTable: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return null;
    const set = new Set<number>();
    for (const t of tables) {
      if (t.seats.some((s) => s.name.toLowerCase().includes(query))) set.add(t.table_number);
    }
    return set;
  }, [query, tables]);

  const sel = tables.find((t) => t.table_number === selected) ?? null;

  if (tables.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No one is seated yet.</p>;
  }

  return (
    <div>
      {/* Seat finder + legend */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find where someone's sitting…"
            aria-label="Find where someone is sitting"
            className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Full</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: theme.bg }} /> Filling</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-line-strong" /> Open</span>
        </div>
      </div>

      {query && matches && matches.size === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">No one seated matches “{q}”.</p>
      )}

      {/* The floor */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {tables.map((t, i) => {
          const fill = t.seats.length;
          const ratio = seatsPerTable > 0 ? fill / seatsPerTable : 0;
          const color = ratio >= 1 ? "hsl(var(--success))" : ratio > 0 ? theme.bg : "hsl(var(--line-strong))";
          const isSel = selected === t.table_number;
          const dim = matches !== null && !matches.has(t.table_number);
          const hit = matches?.has(t.table_number) ?? false;
          return (
            <motion.button
              key={t.table_number}
              type="button"
              onClick={() => setSelected(isSel ? null : t.table_number)}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: dim ? 0.35 : 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              aria-pressed={isSel}
              aria-label={`Table ${t.table_number}, ${fill} ${fill === 1 ? "person" : "people"} seated`}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-2xl border bg-surface-2 transition-colors",
                isSel
                  ? "border-accent ring-2 ring-accent"
                  : hit
                    ? "border-accent"
                    : "border-border hover:border-line-strong",
              )}
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-20 blur-md" style={{ background: color }} aria-hidden />
              <span className="relative font-display text-2xl text-foreground">{String(t.table_number).padStart(2, "0")}</span>
              <div className="relative mt-1.5 flex flex-wrap justify-center gap-1">
                {Array.from({ length: seatsPerTable }).map((_, s) => (
                  <span key={s} className="h-1.5 w-1.5 rounded-full" style={{ background: s < fill ? color : "hsl(var(--line))" }} />
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected table roster */}
      <AnimatePresence initial={false}>
        {sel && (
          <motion.div
            key={sel.table_number}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-border bg-background/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 font-display text-sm"
                    style={{ background: theme.bg, color: theme.ink }}
                  >
                    Table {sel.table_number}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {sel.seats.length} {sel.seats.length === 1 ? "person" : "people"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close table"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sel.seats.map((s) => (
                  <li key={s.attendee_id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                    <Avatar name={s.name} seed={s.attendee_id} src={s.avatar_url} size={32} />
                    <span className="truncate text-sm text-foreground">{s.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
