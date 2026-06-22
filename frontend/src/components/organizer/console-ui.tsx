"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/design/colors";
import { TONE } from "@/lib/design/status";

/* ----------------------------- Types ----------------------------- */

// Maps to backend/app/models/schemas.py EventResponse status
export type EventStatus = "upcoming" | "active" | "ended";

/* ----------------------------- Loading ----------------------------- */

/** Centered spinner for an IN-SHELL loading state (organizer already confirmed,
 *  waiting on page data), shared across every console page so the treatment is
 *  identical. (Richer data-loading states use layout-shaped skeletons.) */
export function ConsoleLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/** Full-screen, CHROME-LESS splash for the pre-auth / redirecting window.
 *
 *  Console pages must NOT paint the sidebar + topbar (`ConsoleShell`) until the
 *  organizer ROLE is confirmed. Otherwise a signed-in attendee who opens a
 *  console URL briefly SEES the full console shell (sidenav + dashboard skeleton)
 *  for the ~1s it takes `useOrganizer` to resolve the session and redirect them to
 *  /home. Rendering this neutral brand splash instead means a non-organizer never
 *  glimpses organizer chrome, and a real organizer just sees a momentary splash
 *  that resolves into the console. Standard auth-gate pattern: show nothing
 *  privileged until you know who the user is. */
export function ConsoleGate({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <LogoMark size={44} />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </div>
    </div>
  );
}

/* ----------------------------- Brand mark ----------------------------- */

/** The Studio logo treatment — a coral rounded tile with an italic "p" and a lime status dot. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: "hsl(var(--accent))" }}
    >
      <span
        className="font-display italic leading-none text-white"
        style={{ fontSize: size * 0.5 }}
      >
        p
      </span>
      <span
        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background"
        style={{ background: COLORS.lime }}
      />
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */

export function Card({
  className,
  children,
  hover = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card card-shadow",
        hover && "transition-transform duration-200 hover:-translate-y-1",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ----------------------------- Page header ----------------------------- */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.28em] text-accent">
            / {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[clamp(28px,4vw,44px)] leading-[1.02] tracking-[-0.025em] text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/* ----------------------------- Stat card ----------------------------- */

export function StatCard({
  label,
  value,
  delta,
  up,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: string;
  delta?: string;
  up?: boolean;
  icon: React.ElementType;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Icon className="h-4 w-4 text-accent" />
          </div>
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
                up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              )}
            >
              {up ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {delta}
            </span>
          )}
        </div>
        <div className="mt-4 font-display text-[34px] leading-none tracking-[-0.03em] text-foreground">
          {value}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
      </Card>
    </motion.div>
  );
}

/* ----------------------------- Status chip ----------------------------- */

// Demo pill language (dot + saturated text + 0.14 tint), shared from
// lib/design/status.ts so console chips match every other status pill in the app.
const STATUS_STYLE: Record<EventStatus, { label: string; dot: string; fg: string; bg: string }> = {
  active: { label: "Live", ...TONE.positive },
  upcoming: { label: "Upcoming", ...TONE.pending },
  ended: { label: "Completed", ...TONE.info },
};

export function StatusChip({ status }: { status: EventStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ color: s.fg, background: s.bg }}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "active" && "animate-pulse",
        )}
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  );
}

/* ----------------------------- Segmented control ----------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              active ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="seg-pill"
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Toggle ----------------------------- */

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{
        background: checked ? "hsl(var(--accent))" : "hsl(var(--line-strong))",
      }}
    >
      <motion.span
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
