"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Loader2, Heart, Sparkles, Users, Bookmark, UserCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { LiveShell } from "@/components/live/live-screens";
import { PersonCard, groupByPerson, type Connection } from "@/components/connections/person-card";
import { cn } from "@/lib/utils";

type RelFilter = "all" | "met" | "matches" | "liked" | "saved";

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

  // Saved-contacts filter. Seed the set from the snapshot, then keep it in sync as
  // cards are bookmarked/un-bookmarked so the "Saved" view updates live.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSavedIds(new Set(people.filter((p) => p.saved).map((p) => p.attendee_id)));
  }, [people]);
  const [filter, setFilter] = useState<RelFilter>("all");
  const handleSavedChange = useCallback((id: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Per-relationship counts; saved tracks the live optimistic set, the rest read
  // off the grouped people. A chip only shows when it would match someone.
  const relCounts = useMemo(
    () => ({
      all: people.length,
      met: people.filter((p) => p.met).length,
      matches: people.filter((p) => p.mutual).length,
      liked: people.filter((p) => p.liked).length,
      saved: savedIds.size,
    }),
    [people, savedIds],
  );
  const visible = useMemo(() => {
    return people.filter((p) => {
      if (filter === "met") return p.met;
      if (filter === "matches") return p.mutual;
      if (filter === "liked") return p.liked;
      if (filter === "saved") return savedIds.has(p.attendee_id);
      return true;
    });
  }, [people, filter, savedIds]);

  if (!authChecked || !user) {
    return (
      <LiveShell>
        <Centered label="Loading…" />
      </LiveShell>
    );
  }

  return (
    <LiveShell
      eventId={eventId}
      className="max-w-5xl"
      right={
        <Link href={`/event/${eventId}/live`} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Event
        </Link>
      }
    >
      <header className="max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Your rolodex</p>
        <h1 className="mt-2 text-balance font-display text-3xl leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
          People you met
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          Keep track of every conversation, save the people you want to follow up with, and add private context while it is still fresh.
        </p>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="mt-8 space-y-3">
          <div className="h-20 skeleton rounded-2xl border border-border" />
          <div className="h-20 skeleton rounded-2xl border border-border" />
        </div>
      )}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Stat icon={<Users className="h-4 w-4" />} value={data.total_people_met} label="met" />
            <Stat icon={<Sparkles className="h-4 w-4" />} value={data.rounds_count} label="rounds" />
            <Stat icon={<Heart className="h-4 w-4" />} value={data.matches_count} label="matches" highlight={data.matches_count > 0} />
          </div>

          {people.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="mt-7">
                <RelTabs filter={filter} onChange={setFilter} counts={relCounts} />
              </div>
              {visible.length === 0 ? (
                <SavedEmptyState />
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visible.map((p) => (
                    <PersonCard key={p.attendee_id} person={p} eventId={eventId} onSavedChange={handleSavedChange} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </LiveShell>
  );
}

/** Everyone / Met / Matches / Liked / Saved chip filter for the rolodex. A chip
 *  only shows when it would match someone (no dead filters). */
function RelTabs({
  filter,
  onChange,
  counts,
}: {
  filter: RelFilter;
  onChange: (f: RelFilter) => void;
  counts: Record<RelFilter, number>;
}) {
  const items: { key: RelFilter; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Everyone", icon: <Users className="h-3.5 w-3.5" aria-hidden /> },
    { key: "met", label: "Met", icon: <UserCheck className="h-3.5 w-3.5" aria-hidden /> },
    { key: "matches", label: "Matches", icon: <Heart className="h-3.5 w-3.5 fill-current" aria-hidden /> },
    { key: "liked", label: "Liked", icon: <Heart className="h-3.5 w-3.5" aria-hidden /> },
    { key: "saved", label: "Saved", icon: <Bookmark className="h-3.5 w-3.5" aria-hidden /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items
        .filter((it) => it.key === "all" || counts[it.key] > 0)
        .map((it) => {
          const active = filter === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              {it.icon}
              {it.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-accent-foreground/20 text-accent-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {counts[it.key]}
              </span>
            </button>
          );
        })}
    </div>
  );
}

function SavedEmptyState() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <Bookmark className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-display text-lg text-foreground">Nothing saved yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Tap the <Bookmark className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> on anyone to keep them on your shortlist.
      </p>
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
