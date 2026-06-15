"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Loader2, Heart, Sparkles, Users } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { LiveShell } from "@/components/live/live-screens";
import { PersonCard, groupByPerson, type Connection } from "@/components/connections/person-card";
import { cn } from "@/lib/utils";

interface ConnectionsResp {
  total_people_met: number;
  rounds_count: number;
  matches_count: number;
  connections: Connection[];
}

export default function ConnectionsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<ConnectionsResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace(`/event/${eventId}/register`);
  }, [authChecked, user, eventId, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<{ id: string }>(`/events/${eventId}/attendees/me`);
        const conns = await apiFetch<ConnectionsResp>(
          `/events/${eventId}/attendees/${me.id}/connections`,
        );
        if (!cancelled) setData(conns);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Couldn't load your connections";
        if (/not registered/i.test(msg)) router.replace(`/event/${eventId}/register`);
        else setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, eventId, router]);

  const people = useMemo(() => (data ? groupByPerson(data.connections) : []), [data]);

  if (!authChecked || !user) {
    return (
      <LiveShell>
        <Centered label="Loading…" />
      </LiveShell>
    );
  }

  return (
    <LiveShell eventId={eventId} right={<Link href="/home" className="text-xs text-muted-foreground transition-colors hover:text-foreground">Home</Link>}>
      <header>
        <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Your rolodex</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground">
          People you met
        </h1>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="mt-8 space-y-3">
          <div className="h-20 animate-pulse rounded-2xl border border-border bg-card/40" />
          <div className="h-20 animate-pulse rounded-2xl border border-border bg-card/40" />
        </div>
      )}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            <Stat icon={<Users className="h-4 w-4" />} value={data.total_people_met} label="met" />
            <Stat icon={<Sparkles className="h-4 w-4" />} value={data.rounds_count} label="rounds" />
            <Stat icon={<Heart className="h-4 w-4" />} value={data.matches_count} label="matches" highlight={data.matches_count > 0} />
          </div>

          {people.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {people.map((p) => (
                <PersonCard key={p.attendee_id} person={p} eventId={eventId} />
              ))}
            </ul>
          )}
        </>
      )}
    </LiveShell>
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
        Once the rounds get going, everyone you sit with shows up here.
      </p>
    </div>
  );
}

function Centered({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
