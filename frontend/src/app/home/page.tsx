"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2, LogOut, CalendarDays } from "lucide-react";

import { AuthShell, SignInPanel } from "@/components/auth";
import { EventCard, type EventCardData } from "@/components/home/event-card";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

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

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [events, setEvents] = useState<EventCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!authChecked) return;
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
    return { now, upcoming, past };
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

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.4} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-16 pt-7">
        {/* top bar */}
        <div className="flex items-center justify-between">
          <Wordmark size={24} />
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </button>
        </div>

        {/* greeting */}
        <header className="mt-8">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-accent">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {todayLabel}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground">
            {name ? `Hi, ${name}` : "Your events"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap an event to join or jump back in.
          </p>
        </header>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {events === null && !error && (
          <div className="mt-8 space-y-3">
            <Skeleton />
            <Skeleton />
          </div>
        )}

        {events !== null && events.length === 0 && !error && (
          <EmptyState />
        )}

        <div className="mt-7 space-y-8">
          <Section title="Happening today" events={buckets.now} todayStr={todayStr} />
          <Section title="Upcoming" events={buckets.upcoming} todayStr={todayStr} />
          <Section title="Past" events={buckets.past} todayStr={todayStr} muted />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  events,
  todayStr,
  muted,
}: {
  title: string;
  events: EventCardData[];
  todayStr: string;
  muted?: boolean;
}) {
  if (events.length === 0) return null;
  return (
    <section>
      <h2 className={muted ? "text-xs font-medium uppercase tracking-wider text-muted-foreground" : "text-sm font-semibold text-foreground"}>
        {title}
      </h2>
      <div className="mt-3 space-y-3">
        {events.map((e) => (
          <EventCard key={e.id} event={e} todayStr={todayStr} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-display text-lg text-foreground">No events yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        When an organizer shares an event, it&apos;ll show up here.
      </p>
    </div>
  );
}

function Skeleton() {
  return <div className="h-[112px] animate-pulse rounded-2xl border border-border bg-card/40" />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      {children}
    </div>
  );
}
