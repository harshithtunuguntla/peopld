"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Round countdown. The remaining time is derived locally from the server's
 * `ends_at` and `server_time` (never streamed) — we correct for client clock
 * skew so every phone agrees. Fires `onExpire` once when it reaches zero so the
 * page can re-fetch the authoritative snapshot.
 */
export function useCountdown(
  endsAt: string | null,
  serverTime: string,
  onExpire?: () => void,
  pausedAt?: string | null,
) {
  // Offset between this device's clock and the server's, captured per snapshot.
  const skew = useMemo(() => Date.now() - Date.parse(serverTime), [serverTime]);
  const endMs = useMemo(() => (endsAt ? Date.parse(endsAt) : null), [endsAt]);
  // When paused, freeze the clock at the moment of pause (server time, so the
  // skew correction cancels out: both endMs and pausedMs are server-clock).
  const pausedMs = useMemo(() => (pausedAt ? Date.parse(pausedAt) : null), [pausedAt]);

  const compute = () => {
    if (endMs === null) return null;
    const refNow = pausedMs !== null ? pausedMs : Date.now() - skew;
    return Math.max(0, Math.round((endMs - refNow) / 1000));
  };
  const [remaining, setRemaining] = useState<number | null>(compute);

  useEffect(() => {
    if (endMs === null) {
      setRemaining(null);
      return;
    }
    setRemaining(compute());
    if (pausedMs !== null) return; // frozen while paused — no ticking, no expire
    let fired = false;
    const id = setInterval(() => {
      const r = compute();
      setRemaining(r);
      if (r === 0 && !fired) {
        fired = true;
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMs, skew, pausedMs]);

  return remaining;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Big mm:ss pill for the round view. */
export function CountdownPill({
  remaining,
  paused = false,
  className,
}: {
  remaining: number | null;
  paused?: boolean;
  className?: string;
}) {
  const low = remaining !== null && remaining <= 30;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm tabular-nums transition-colors",
        paused
          ? "bg-warning/15 text-warning"
          : remaining === 0
            ? "bg-muted text-muted-foreground"
            : low
              ? "bg-accent/15 text-accent"
              : "bg-foreground/10 text-foreground",
        className,
      )}
      aria-live="polite"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", paused || remaining === 0 ? "bg-current" : "animate-pulse bg-current")} aria-hidden />
      {paused
        ? `Paused · ${remaining === null ? "" : fmt(remaining)}`.trim()
        : remaining === null
          ? "Starting…"
          : remaining === 0
            ? "Wrapping up…"
            : fmt(remaining)}
    </span>
  );
}
