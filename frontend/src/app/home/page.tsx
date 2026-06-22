"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Loader2, CalendarDays, KeyRound, Users, ArrowRight } from "lucide-react";

import { AuthShell, SignInPanel } from "@/components/auth";
import { AccountMenu } from "@/components/attendee/account-menu";
import { EventCard, FeaturedEventCard, type EventCardData } from "@/components/home/event-card";
import { JoinByCodeDialog } from "@/components/attendee/join-by-code-dialog";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Local YYYY-MM-DD (matches how events store their date). */
function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A friendly first name from the auth identity, if we have one. */
function firstNameOf(user: User | null): string | null {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name || meta.name) as string | undefined;
  if (full) return full.trim().split(/\s+/)[0];
  return null;
}

function eventDateDesc(a: EventCardData, b: EventCardData): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  return b.time.localeCompare(a.time);
}

type Dialog = null | "code";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [events, setEvents] = useState<EventCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  // Auth state.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // The feed loads for everyone, but `registered` only resolves once signed in,
  // so (re)fetch whenever the user changes.
  useEffect(() => {
    if (!authChecked || !user) return;
    setError(null);
    apiFetch<EventCardData[]>("/events")
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load events"));
  }, [authChecked, user]);

  const todayStr = useMemo(() => localDateStr(), []);
  const buckets = useMemo(() => {
    const now: EventCardData[] = [];
    const upcoming: EventCardData[] = [];
    const past: EventCardData[] = [];
    for (const e of events ?? []) {
      if (e.status === "ended" || e.date < todayStr) past.push(e);
      else if (e.status === "active" || e.date === todayStr) now.push(e);
      else upcoming.push(e);
    }
    return { now, upcoming: upcoming.sort(eventDateDesc), past: past.sort(eventDateDesc) };
  }, [events, todayStr]);
  const profileEventId = useMemo(() => {
    const registered = (events ?? []).filter((e) => e.registered);
    const [todayEvent] = registered
      .filter((e) => e.status === "active" || e.date === todayStr)
      .sort(eventDateDesc);
    const [latestRegistered] = registered.sort(eventDateDesc);
    return (todayEvent ?? latestRegistered)?.id ?? null;
  }, [events, todayStr]);

  if (!authChecked) {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading…
      </Centered>
    );
  }

  // Signed out → the home is also the sign-in surface (sign-in lands right back here).
  if (!user) {
    return (
      <AuthShell>
        <SignInPanel nextPath="/home" />
      </AuthShell>
    );
  }

  const name = firstNameOf(user);
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hasEvents = (events?.length ?? 0) > 0;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.4} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        {/* top bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            aria-label="Go to Peopld home"
            className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Wordmark size={24} />
          </Link>
          <div className="flex items-center gap-2">
            <AccountMenu
              user={user}
              editProfileHref={profileEventId ? `/event/${profileEventId}/profile` : null}
              connectionsHref="/me/connections"
            />
          </div>
        </div>

        {/* greeting */}
        <header className="mt-8">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-accent">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {todayLabel}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
            {name ? `Hi, ${name}` : "Welcome"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join an event with the access code your organizer reads out in the room.
          </p>
        </header>

        {/* primary actions */}
        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionCard
            icon={<KeyRound className="h-5 w-5" aria-hidden />}
            title="Join via access code"
            blurb="Type the code from the room"
            onClick={() => setDialog("code")}
            accent
          />
          <ActionCard
            icon={<Users className="h-5 w-5" aria-hidden />}
            title="My connections"
            blurb="Everyone you've met"
            onClick={() => router.push("/me/connections")}
          />
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* your events */}
        {events === null && !error && (
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton />
            <Skeleton />
          </div>
        )}

        {hasEvents && (
          <div className="mt-10 space-y-8">
            <Section title="Happening today" events={buckets.now} todayStr={todayStr} featured />
            <Section title="Upcoming" events={buckets.upcoming} todayStr={todayStr} />
            <Section title="Past" events={buckets.past} todayStr={todayStr} muted />
          </div>
        )}
      </div>

      {dialog === "code" && <JoinByCodeDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  blurb,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-col sm:items-start sm:gap-4 sm:p-5",
        accent
          ? "border-accent/30 bg-gradient-to-br from-accent/15 to-accent/[0.04] hover:border-accent/50"
          : "border-border bg-card/70 hover:border-foreground/20 hover:bg-card",
      )}
    >
      {/* Soft corner glow — picks up the card's tone on hover. */}
      <span
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-60",
          accent ? "bg-accent/40" : "bg-foreground/10",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105",
          accent ? "bg-accent text-accent-foreground" : "bg-foreground text-background",
        )}
      >
        {icon}
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="font-display text-base text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{blurb}</span>
      </span>
      <ArrowRight
        className="relative z-10 h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-foreground sm:absolute sm:right-5 sm:top-5 sm:self-auto"
        aria-hidden
      />
    </button>
  );
}

function Section({
  title,
  events,
  todayStr,
  muted,
  featured,
}: {
  title: string;
  events: EventCardData[];
  todayStr: string;
  muted?: boolean;
  /** Render each event as a full-width hero (used for the live / today section). */
  featured?: boolean;
}) {
  if (events.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className={cn("font-semibold tracking-tight", muted ? "text-sm text-muted-foreground" : "text-base text-foreground")}>
          {title}
        </h2>
        <span className="text-xs font-medium text-muted-foreground">{events.length}</span>
      </div>
      {featured ? (
        <div className="mt-3 space-y-4">
          {events.map((e, i) => (
            <FeaturedEventCard key={e.id} event={e} todayStr={todayStr} index={i} />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {events.map((e, i) => (
            <EventCard key={e.id} event={e} todayStr={todayStr} index={i} dimmed={muted} />
          ))}
        </div>
      )}
    </section>
  );
}

function Skeleton() {
  return <div className="h-[244px] skeleton rounded-2xl border border-border" />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      {children}
    </div>
  );
}
