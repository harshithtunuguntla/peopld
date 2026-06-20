"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Users, Armchair, Heart, Sparkles, AlertTriangle, FileText } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { StatCard } from "@/components/organizer/console-ui";
import { EventHeader, EventAccessError } from "@/components/organizer/event-header";
import { cn } from "@/lib/utils";

import {
  type EventInfo,
  type Attendee,
  type LiveStats,
  type Phase,
  type ActiveRound,
  type RoundDraft,
} from "@/components/organizer/live/types";
import { IdleView, DraftView, ActiveView, EndedView } from "@/components/organizer/live/views";
import { RoomCodePanel } from "@/components/organizer/live/room-code-panel";

export default function OrganizerLiveControlPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<null | "forbidden" | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [ev, people] = await Promise.all([
        apiFetch<EventInfo>(`/events/${eventId}`),
        apiFetch<Attendee[]>(`/events/${eventId}/attendees`),
      ]);
      setEvent(ev);
      setAttendees(people);
      apiFetch<LiveStats>(`/events/${eventId}/live-stats`).then(setStats).catch(() => {});

      if (ev.status === "ended") {
        setPhase({ kind: "ended" });
        return;
      }
      try {
        const round = await apiFetch<ActiveRound>(`/events/${eventId}/rounds/current`);
        setPhase({ kind: "active", round });
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      try {
        const draft = await apiFetch<RoundDraft>(`/events/${eventId}/rounds/draft`);
        setPhase({ kind: "draft", draft });
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      setPhase({ kind: "idle" });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setDenied("forbidden");
      } else if (e instanceof ApiError && e.status === 404) {
        setDenied("missing");
      } else {
        setError(e instanceof Error ? e.message : "Couldn't load the control room");
      }
    }
  }, [eventId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Realtime doorbell + slow poll. The control room used to blind-poll every 12s
  // (4–5 calls each tick). Now it reloads on actual round/seating changes via
  // Supabase Realtime — debounced so a publish (one INSERT per attendee) is a
  // single reload — and falls back to a 60s poll for stats freshness (the Refresh
  // button is there for an instant manual pull).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!busyRef.current) load();
    }, 300);
  }, [load]);

  useEffect(() => {
    if (!user) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`organizer-live:${eventId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `event_id=eq.${eventId}` }, reload)
        .on("postgres_changes", { event: "*", schema: "public", table: "table_assignments", filter: `event_id=eq.${eventId}` }, reload)
        .subscribe();
    } catch {
      // Realtime unavailable — the poll below still keeps the room fresh.
    }

    const id = setInterval(() => {
      if (!busyRef.current) load();
    }, 60_000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(id);
    };
  }, [user, eventId, load, reload]);

  async function refresh() {
    setRefreshing(true);
    busyRef.current = true;
    setError(null);
    await load();
    busyRef.current = false;
    setRefreshing(false);
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    busyRef.current = true;
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  const byId = new Map(attendees.map((a) => [a.id, a]));
  const arrivedCount = attendees.filter((a) => a.status === "arrived").length;
  // Only non-guest attendees are seated, so the "ready to seat" count and the
  // start-round gate must exclude speakers/hosts (they're arrived but off the floor).
  const seatableCount = attendees.filter((a) => a.status === "arrived" && a.tag === "attendee").length;

  if (denied) {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} active="live" />
        <EventAccessError notFound={denied === "missing"} />
      </ConsoleShell>
    );
  }

  if (!checked || !user || phase.kind === "loading") {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} name={event?.name} status={event?.status} active="live" />
        <div className="space-y-3">
          <div className="h-28 skeleton rounded-2xl border border-border" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 skeleton rounded-2xl border border-border" />
            ))}
          </div>
        </div>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell>
      <EventHeader
        eventId={eventId}
        name={event?.name}
        status={event?.status}
        active="live"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/organizer/event/${eventId}/run-sheet`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open a printable seating backup for the whole event"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileText className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Run sheet</span>
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || busy}
              aria-label="Refresh"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            </button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Arrived" value={stats?.arrived.toString() || arrivedCount.toString()} icon={Users} />
        <StatCard
          label={phase.kind === "active" ? "Seated Now" : "Ready to Seat"}
          value={phase.kind === "active" ? (stats?.seated_now.toString() || "0") : seatableCount.toString()}
          icon={Armchair}
        />
        <StatCard label="Likes" value={stats?.likes_count.toString() || "0"} icon={Heart} />
        <StatCard label="Matches" value={stats?.matches_count.toString() || "0"} icon={Sparkles} />
      </div>

      {error && (
        <p role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {event && event.status !== "ended" && <RoomCodePanel eventId={eventId} />}

      <div>
        {phase.kind === "ended" && <EndedView eventId={eventId} />}
        {phase.kind === "idle" && (
          <IdleView
            arrivedCount={seatableCount}
            roundsCompleted={stats?.rounds_completed ?? 0}
            targetRounds={event?.target_rounds ?? null}
            roundTopics={event?.round_topics ?? []}
            busy={busy}
            onStart={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/start`, { method: "POST" }); })}
            onEndEvent={() => act(async () => { await apiFetch(`/events/${eventId}/end`, { method: "POST" }); })}
          />
        )}
        {phase.kind === "draft" && (
          <DraftView
            draft={phase.draft}
            byId={byId}
            busy={busy}
            onPublish={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/publish`, { method: "POST" }); })}
            onRegenerate={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/regenerate`, { method: "POST" }); })}
            onMove={(attendeeId, tableNumber) => act(async () => {
              await apiFetch(`/events/${eventId}/rounds/draft/move`, {
                method: "POST",
                body: JSON.stringify({ attendee_id: attendeeId, table_number: tableNumber }),
              });
            })}
            onAddTable={() => act(async () => {
              // Bump the venue's table count, then re-plan the draft so the extra
              // table absorbs the overfill. Keeps the organizer in control of capacity.
              const next = (event?.num_tables ?? 0) + 1;
              await apiFetch(`/events/${eventId}`, {
                method: "PATCH",
                body: JSON.stringify({ num_tables: next }),
              });
              await apiFetch(`/events/${eventId}/rounds/regenerate`, { method: "POST" });
            })}
          />
        )}
        {phase.kind === "active" && (
          <ActiveView
            round={phase.round}
            byId={byId}
            busy={busy}
            autoAdvance={event?.auto_advance ?? true}
            onBegin={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/begin`, { method: "POST" }); })}
            onExtend={(seconds) => act(async () => { await apiFetch(`/events/${eventId}/rounds/extend`, { method: "POST", body: JSON.stringify({ seconds }) }); })}
            onEnd={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/end`, { method: "POST" }); })}
            onCancel={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/cancel`, { method: "POST" }); })}
            onPause={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/pause`, { method: "POST" }); })}
            onResume={() => act(async () => { await apiFetch(`/events/${eventId}/rounds/resume`, { method: "POST" }); })}
          />
        )}
      </div>
    </ConsoleShell>
  );
}
