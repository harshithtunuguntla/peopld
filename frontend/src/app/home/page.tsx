"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Loader2, LogOut, CalendarDays, KeyRound, Users, ArrowRight } from "lucide-react";

import { AuthShell, SignInPanel } from "@/components/auth";
import { EventCard, type EventCardData } from "@/components/home/event-card";
import { JoinByCodeDialog } from "@/components/attendee/join-by-code-dialog";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
  const hasEvents = (events?.length ?? 0) > 0;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.4} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        {/* top bar */}
        <div className="flex items-center justify-between">
          <Wordmark size={24} />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
            </button>
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
            <Section title="Happening today" events={buckets.now} todayStr={todayStr} />
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
        "group flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-col sm:items-start sm:gap-4 sm:p-5",
        accent
          ? "border-accent/40 bg-accent/10 hover:bg-accent/15"
          : "border-border bg-card/60 hover:border-foreground/20 hover:bg-card",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          accent ? "bg-accent/20 text-accent" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-display text-base text-foreground">
          {title}
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:hidden" aria-hidden />
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{blurb}</span>
      </span>
    </button>
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
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} todayStr={todayStr} />
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return <div className="h-[112px] skeleton rounded-2xl border border-border" />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      {children}
    </div>
  );
}
