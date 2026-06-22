import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Lock, MapPin, Check } from "lucide-react";
import { EVENT_PHASE, REGISTERED_TONE } from "@/lib/design/status";
import { StatusPill } from "@/components/ui/status-pill";

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
}

/** "18:00:00" -> "6:00 PM" (locale-aware, no date dependency). */
function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
 */
export function EventCard({ event, todayStr }: { event: EventCardData; todayStr: string }) {
  const phase = phaseOf(event, todayStr);

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

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl border border-border bg-card/60 p-4 transition-colors hover:border-foreground/20 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* phase-keyed brand glow so the card reads alive, not flat cream */}
      <span
        className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: EVENT_PHASE[phase].glow }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusBadge phase={phase} />
          <h3 className="mt-2 truncate font-display text-lg leading-tight text-foreground">
            {event.name}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /> {formatDate(event.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> {formatTime(event.time)}
            </span>
          </p>
          <p className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{event.location}</span>
          </p>
        </div>
        {event.registered && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium"
            style={{ color: REGISTERED_TONE.fg, background: REGISTERED_TONE.bg }}
            title="You're registered"
          >
            <Check className="h-3 w-3" aria-hidden /> Registered
          </span>
        )}
      </div>

      <div className="relative mt-3.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {event.requires_code && <Lock className="h-3.5 w-3.5" aria-hidden />}
          <span className="font-medium text-foreground">{event.attendee_count}</span> going
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-transform group-hover:translate-x-0.5">
          {cta} <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function StatusBadge({ phase }: { phase: Phase }) {
  const { label, tone } = EVENT_PHASE[phase];
  return <StatusPill tone={tone} label={label} pulse={phase === "now"} uppercase />;
}
