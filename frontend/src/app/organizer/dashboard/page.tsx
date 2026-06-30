"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus, Users, Radio, MapPin, ArrowRight, Heart, Handshake, CalendarDays, AlertTriangle, RefreshCw,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { Card, StatusChip, ConsoleGate } from "@/components/organizer/console-ui";
import { BentoTile } from "@/components/organizer/metric-tile";
import { EventCard, type OrgEvent } from "@/components/organizer/event-card";
import { Button } from "@/components/ui/button";
import { eventColor } from "@/lib/design/event-cover";
import { cn } from "@/lib/utils";

interface Summary {
  events_total: number;
  events_live: number;
  events_upcoming: number;
  events_completed: number;
  guests_total: number;
  connections_total: number;
  introductions_total: number;
}

interface LiveStats {
  arrived: number;
  registered: number;
  matches_count: number;
  active_round_number: number | null;
  rounds_completed: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const PREVIEW_COUNT = 3;

export default function OrganizerDashboardPage() {
  const { user, checked } = useOrganizer();
  const [events, setEvents] = useState<OrgEvent[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // Events are the critical content (drive error/retry); the summary is
    // best-effort so a hiccup there only blanks the bento, never the whole page.
    apiFetch<OrgEvent[]>("/events/mine")
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your dashboard"))
      .finally(() => setLoading(false));
    apiFetch<Summary>("/events/dashboard-summary").then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Pre-auth / redirecting: a neutral splash, NEVER the console chrome — so a
  // signed-in attendee who opened this URL never glimpses the organizer shell
  // before useOrganizer redirects them to /home.
  if (!checked || !user) return <ConsoleGate />;

  const firstName = greetingName(user.user_metadata?.name as string | undefined, user.email);
  const liveEvent = events?.find((e) => e.status === "active" && !e.is_archived) ?? null;
  const preview = (events ?? []).slice(0, PREVIEW_COUNT);

  return (
    <ConsoleShell>
      <GreetingHero name={firstName} hasLive={Boolean(liveEvent)} />

      {error && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </Button>
        </div>
      )}

      {liveEvent && <LiveEventHero event={liveEvent} />}

      <BentoTiles summary={summary} loading={loading} />

      {/* Your events preview */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.28em] text-accent">/ your events</div>
          <h2 className="font-display text-2xl tracking-[-0.02em] text-foreground">Recent rooms</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/organizer/events" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Manage all <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/organizer/events?new=1"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" /> New event
          </Link>
        </div>
      </div>

      {loading && !events && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 skeleton rounded-2xl border border-border" />
          ))}
        </div>
      )}

      {events && preview.length === 0 && !error && (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-display text-xl text-foreground">No events yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first event and the room will follow.</p>
          <Link href="/organizer/events?new=1" className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground">
            <Plus className="h-4 w-4" /> Create event
          </Link>
        </div>
      )}

      {events && preview.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {preview.map((e, i) => (
            <EventCard key={e.id} event={e} onChanged={load} index={i} />
          ))}
        </div>
      )}
    </ConsoleShell>
  );
}

/* --------------------------------- Greeting --------------------------------- */

function GreetingHero({ name, hasLive }: { name: string; hasLive: boolean }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mb-7"
    >
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.28em] text-accent">
        / good {part}{name ? `, ${name}` : ""}
      </div>
      <h1 className="font-display text-[clamp(30px,5vw,52px)] leading-[0.98] tracking-[-0.03em] text-foreground">
        {hasLive ? (
          <>The room <em className="italic text-accent">is yours.</em></>
        ) : (
          <>Let&apos;s fill a <em className="italic text-accent">room.</em></>
        )}
      </h1>
      <p className="mt-2.5 max-w-lg text-sm text-muted-foreground">
        {hasLive
          ? "One event is live right now. Here's everything you've built, and what the room is doing."
          : "Create an event, invite the room, and run structured rounds that actually make people connect."}
      </p>
    </motion.div>
  );
}

/* ------------------------------ Live event hero ------------------------------ */

function LiveEventHero({ event }: { event: OrgEvent }) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  useEffect(() => {
    apiFetch<LiveStats>(`/events/${event.id}/live-stats`).then(setStats).catch(() => {});
  }, [event.id]);

  const cover = eventColor(event.id);
  const metrics = [
    { v: stats ? `${stats.arrived}` : "—", sub: stats ? `/${stats.registered}` : "", l: "arrived" },
    { v: stats?.active_round_number ? `${stats.active_round_number}` : `${stats?.rounds_completed ?? 0}`, sub: "", l: stats?.active_round_number ? "round live" : "rounds done" },
    { v: stats ? `${stats.matches_count}` : "—", sub: "", l: "connections", accent: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
    >
      <Card className="mb-4 overflow-hidden p-0">
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <StatusChip status="active" />
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden /> {event.location}
              </span>
            </div>
            <h2 className="mt-4 font-display text-[clamp(24px,3vw,38px)] leading-[1.0] tracking-[-0.02em] text-foreground">
              {event.name}
            </h2>
            <div className="mt-6 flex flex-wrap gap-x-9 gap-y-4">
              {metrics.map((m, i) => (
                <div key={i}>
                  <div
                    className={cn(
                      "font-display text-[clamp(28px,4vw,44px)] leading-none tracking-[-0.03em]",
                      m.accent ? "text-accent" : "text-foreground",
                    )}
                  >
                    {m.v}
                    {m.sub && <span className="align-top text-[0.45em] text-muted-foreground">{m.sub}</span>}
                  </div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{m.l}</div>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link
                href={`/organizer/event/${event.id}/live`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Radio className="h-4 w-4" aria-hidden /> Open command center <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={`/organizer/event/${event.id}/people`}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Users className="h-4 w-4" aria-hidden /> People
              </Link>
            </div>
          </div>

          {/* Cover panel — image when set, else the event's deterministic color. */}
          <div className="stat-fill relative hidden min-h-[180px] overflow-hidden lg:block" style={{ "--tile-bg": cover.bg } as CSSProperties}>
            {event.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <>
                <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-25" style={{ background: cover.ink }} aria-hidden />
                <span
                  className="absolute bottom-6 right-7 font-display leading-none tracking-[-0.04em] opacity-90"
                  style={{ color: cover.ink, fontSize: 96 }}
                  aria-hidden
                >
                  p
                </span>
              </>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* -------------------------------- Bento tiles -------------------------------- */

function BentoTiles({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[124px] skeleton rounded-3xl sm:h-[140px]" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <BentoTile value={summary?.events_total} label="events hosted" bg="#FF5A3C" fg="#fff" icon={CalendarDays} delay={0.05}
        info="Events you've run on Peopld (excludes archived)." />
      <BentoTile value={summary?.guests_total} label="guests welcomed" bg="#D9FF4D" fg="#15130E" icon={Users} delay={0.1}
        info="Everyone who joined your events, all-time." />
      <BentoTile value={summary?.introductions_total} label="conversations sparked" bg="#A8D5FF" fg="#15130E" icon={Handshake} delay={0.15}
        info="Unique pairs of people we seated together — every new conversation the seating engine created." />
      <BentoTile value={summary?.connections_total} label="connections made" bg="#B66CFF" fg="#fff" icon={Heart} delay={0.2}
        info="Mutual matches — both people liked each other and want to stay in touch." />
    </div>
  );
}

function greetingName(name: string | undefined, email: string | undefined): string {
  if (name && name.trim()) return name.trim().split(/\s+/)[0];
  if (email) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return local.split(/\s+/)[0].replace(/^\w/, (c) => c.toUpperCase());
  }
  return "";
}
