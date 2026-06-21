"use client";

import Link from "next/link";
import { ChevronLeft, Radio, Users, Lock, Settings, BarChart3 } from "lucide-react";
import { StatusChip, type EventStatus } from "./console-ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The header shown on every per-event screen (Command Center, People). It owns the
 * "you are inside an event" context: a back link to all events, the event name +
 * status, and a sub-nav tab bar to move between this event's screens.
 *
 * This is deliberately NOT in the global sidebar — Command Center / People are
 * event-scoped, so they live as in-page tabs (clear primary-vs-secondary nav
 * separation) instead of cluttering the console's global navigation.
 */
const TABS = [
  { key: "live", label: "Command Center", icon: Radio },
  { key: "people", label: "People", icon: Users },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

export function EventHeader({
  eventId,
  name,
  status,
  active,
  actions,
}: {
  eventId: string;
  name?: string;
  status?: EventStatus;
  active: "live" | "people" | "analytics" | "settings";
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <Link
        href="/organizer/dashboard"
        className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> All events
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-accent">/ Event</span>
            {status && <StatusChip status={status} />}
          </div>
          <h1 className="truncate font-display text-[clamp(28px,4vw,44px)] leading-[1.02] tracking-[-0.025em] text-foreground">
            {name || "Loading event…"}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* Sub-nav: switch between this event's screens. */}
      <div className="mt-5 inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1">
        {TABS.map((t) => {
          const isActive = t.key === active;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={`/organizer/event/${eventId}/${t.key}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden /> {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export type { EventStatus };

/** Friendly card shown when an organizer hits an event they don't own / that's gone. */
export function EventAccessError({ notFound = false }: { notFound?: boolean }) {
  return (
    <div className="card-shadow rounded-2xl border border-border bg-card p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground">
        <Lock className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="mt-5 font-display text-2xl text-foreground">
        {notFound ? "Event not found" : "Event unavailable"}
      </h2>
      {/* Both cases stay deliberately neutral. Telling a signed-in organizer
          "this is someone else's event" would confirm the event exists — the
          leak-free pattern (GitHub's, for private repos) reveals nothing. */}
      <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-muted-foreground">
        {notFound
          ? "This event doesn’t exist or has been removed."
          : "This event isn’t available on your account."}
      </p>
      <Link href="/organizer/dashboard" className={cn(buttonVariants({ variant: "outline" }), "mt-6 gap-1.5")}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>
    </div>
  );
}
