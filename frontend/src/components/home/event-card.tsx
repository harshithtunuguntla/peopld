"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, Check, Lock, MapPin, Users } from "lucide-react";
import { EVENT_PHASE, REGISTERED_TONE } from "@/lib/design/status";
import { eventColor } from "@/lib/design/event-cover";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

export interface EventCardData {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  location: string;
  status: "upcoming" | "active" | "ended";
  requires_code: boolean;
  attendee_count: number;
  registered: boolean;
  cover_image_url: string | null; // event branding — mirrors the organizer card
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** "18:00:00" -> "6:00 PM" (locale-aware, no date dependency). */
function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Date parts for the band's date block + the full meta line. */
function dateParts(dateStr: string, time: string) {
  const d = new Date(`${dateStr}T${time || "00:00:00"}`);
  return {
    day: d.getDate(),
    mon: d.toLocaleDateString(undefined, { month: "short" }),
    full: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
  };
}

type Phase = "now" | "upcoming" | "ended";

function phaseOf(e: EventCardData, todayStr: string): Phase {
  if (e.status === "ended" || e.date < todayStr) return "ended";
  if (e.status === "active" || e.date === todayStr) return "now";
  return "upcoming";
}

/**
 * One event on the attendee home feed. The whole card is a link; where it goes
 * and what the CTA says depend on the caller's own state (registered?) and the
 * event phase. Live links carry only the event id — the attendee is resolved
 * from the session, never the URL (PRODUCT.md hard rule).
 *
 * The cover band leads with a DATE block (the most important field for an event)
 * over the event's signature color as a soft gradient — or a real cover image when
 * set. `dimmed` recedes past events so the feed reads upcoming-first.
 */
export function EventCard({
  event,
  todayStr,
  index = 0,
  dimmed = false,
}: {
  event: EventCardData;
  todayStr: string;
  index?: number;
  dimmed?: boolean;
}) {
  const reduce = useReducedMotion();
  const phase = phaseOf(event, todayStr);
  const cover = eventColor(event.id);
  const { day, mon, full } = dateParts(event.date, event.time);

  const href =
    phase === "ended" && event.registered
      ? `/event/${event.id}/connections`
      : event.registered
        ? `/event/${event.id}/live`
        : `/event/${event.id}/register`;

  const cta =
    phase === "ended"
      ? event.registered
        ? "View recap"
        : "View"
      : event.registered
        ? "Enter"
        : "Join";

  // Soft two-stop gradient of the event's own hue — calmer than a flat fill, still
  // its signature color (same identity as the organizer dashboard card).
  const bandStyle = { background: `linear-gradient(140deg, ${cover.bg} 0%, color-mix(in srgb, ${cover.bg} 70%, #000) 100%)` };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index * 0.05, 0.3) }}
    >
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-2xl border border-border bg-card/60 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:bg-card hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* Cover band */}
        <div
          className={cn("relative h-32 overflow-hidden sm:h-36", dimmed && "opacity-80 saturate-[0.55]")}
          style={bandStyle}
        >
          {event.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            // One clean corner bubble — same language as the KPI stat tiles, so the
            // color treatment stays consistent app-wide.
            <span
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-15"
              style={{ background: cover.ink }}
              aria-hidden
            />
          )}

          {/* Date block — leads the card (most important field). */}
          <div className="absolute left-3 top-3 flex flex-col items-center rounded-xl bg-background/90 px-2.5 py-1.5 leading-none shadow-sm ring-1 ring-black/10 backdrop-blur-md dark:ring-white/10">
            <span className="font-display text-lg text-foreground">{day}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{mon}</span>
          </div>

          {/* Status + registered, top-right, on solid chips so they read on any band. */}
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {event.registered && (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full bg-background/90 shadow-sm ring-1 ring-black/10 backdrop-blur-md dark:ring-white/10"
                title="You're registered"
              >
                <Check className="h-3.5 w-3.5" style={{ color: REGISTERED_TONE.dot }} aria-label="You're registered" />
              </span>
            )}
            <StatusBadge phase={phase} />
          </div>

          {event.requires_code && (
            <span
              className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-black/10 backdrop-blur-md dark:ring-white/10"
              title="Access code required"
            >
              <Lock className="h-3 w-3" aria-hidden /> Code
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-4">
          <h3 className="truncate font-display text-lg leading-tight text-foreground">
            {event.name}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /> {full} · {formatTime(event.time)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{event.location}</span>
            </span>
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <span className="font-semibold text-foreground">{event.attendee_count}</span> going
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent transition-transform group-hover:translate-x-0.5">
              {cta} <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function StatusBadge({ phase }: { phase: Phase }) {
  const { label, tone } = EVENT_PHASE[phase];
  // `solid` so the label stays readable on top of the cover band / image.
  return <StatusPill tone={tone} label={label} pulse={phase === "now"} uppercase solid />;
}
