"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Loader2, ChevronLeft, Users, CalendarDays, Heart } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { PersonCard, type Person, type Connection } from "@/components/connections/person-card";
import { cn } from "@/lib/utils";

interface MyConnection extends Connection {
  event_id: string;
  event_name: string;
  event_date: string; // YYYY-MM-DD
}
interface MyConnectionsResp {
  total_people_met: number;
  events_count: number;
  matches_count: number;
  connections: MyConnection[];
}

/** "2026-07-01" -> "1 Jul". */
function shortDate(d: string): string {
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** One card per (event, person) — the same person at two events shows twice,
 * each tagged with its event. */
function groupCrossEvent(rows: MyConnection[]): { person: Person; eventId: string }[] {
  const map = new Map<string, { person: Person; eventId: string }>();
  for (const c of rows) {
    const key = `${c.event_id}::${c.attendee_id}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.person.rounds.includes(c.round_number)) existing.person.rounds.push(c.round_number);
      existing.person.liked = existing.person.liked || c.liked;
      existing.person.mutual = existing.person.mutual || c.mutual;
    } else {
      map.set(key, {
        eventId: c.event_id,
        person: {
          attendee_id: c.attendee_id,
          name: c.name,
          role: c.role,
          looking_for: c.looking_for,
          whatsapp_number: c.whatsapp_number,
          linkedin_url: c.linkedin_url,
          avatar_url: c.avatar_url,
          interests: c.interests ?? [],
          shared_interests: c.shared_interests ?? [],
          note: c.note,
          rounds: [c.round_number],
          liked: c.liked,
          mutual: c.mutual,
          eventLabel: `${c.event_name} · ${shortDate(c.event_date)}`,
        },
      });
    }
  }
  // Matches first, then by name.
  return [...map.values()].sort(
    (a, b) => Number(b.person.mutual) - Number(a.person.mutual) || a.person.name.localeCompare(b.person.name),
  );
}

export default function MyConnectionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<MyConnectionsResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace("/home");
  }, [authChecked, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch<MyConnectionsResp>("/me/connections")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your connections"));
  }, [user]);

  const cards = useMemo(() => (data ? groupCrossEvent(data.connections) : []), [data]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.35} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        <div className="flex items-center justify-between">
          <Wordmark size={24} />
          <Link
            href="/home"
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Hub
          </Link>
        </div>

        <header className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Your rolodex</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
            My connections
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Everyone you&apos;ve met, across every event.</p>
        </header>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
            <div className="h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <Stat icon={<Users className="h-4 w-4" />} value={data.total_people_met} label="met" />
              <Stat icon={<CalendarDays className="h-4 w-4" />} value={data.events_count} label="events" />
              <Stat icon={<Heart className="h-4 w-4" />} value={data.matches_count} label="matches" highlight={data.matches_count > 0} />
            </div>

            {cards.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {cards.map(({ person, eventId }) => (
                  <PersonCard key={`${eventId}-${person.attendee_id}`} person={person} eventId={eventId} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label, highlight }: { icon: React.ReactNode; value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 text-center", highlight ? "border-accent/40 bg-accent/10" : "border-border bg-card/50")}>
      <div className={cn("mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full", highlight ? "text-accent" : "text-muted-foreground")}>
        {icon}
      </div>
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <Users className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-display text-lg text-foreground">No connections yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Join an event and the people you sit with will collect here.
      </p>
    </div>
  );
}
