"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Play,
  Pause,
  RefreshCw,
  Rocket,
  Radio,
  Square,
  Trash2,
  Flag,
  Users,
  Armchair,
  Heart,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Search,
  X,
  MapPin,
  KeyRound,
  Copy,
  Check,
  DoorOpen,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { Card, StatCard } from "@/components/organizer/console-ui";
import { EventHeader, EventAccessError } from "@/components/organizer/event-header";
import { Avatar } from "@/components/brand/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCountdown } from "@/components/live/countdown";
import { roundFor, type Round } from "@/lib/design/rounds";
import { cn } from "@/lib/utils";

// --- Types (mirror the backend round schemas) ---
interface EventInfo {
  id: string;
  name: string;
  num_tables: number;
  seats_per_table: number;
  default_round_duration_seconds: number;
  status: "upcoming" | "active" | "ended";
}
interface Attendee {
  id: string;
  name: string;
  role: string;
  status: "registered" | "arrived" | "left";
  avatar_url: string | null;
}
interface DraftAssignment {
  attendee_id: string;
  name: string;
  table_number: number;
}
interface RoundDraft {
  id: string;
  round_number: number;
  duration_seconds: number;
  arrived_count: number;
  table_count: number;
  repeat_pairings: number;
  assignments: DraftAssignment[];
}
interface ActiveAssignment {
  attendee_id: string;
  table_number: number;
}
interface ActiveRound {
  id: string;
  round_number: number;
  duration_seconds: number;
  started_at: string | null;
  status: string;
  paused_at: string | null;
  total_paused_seconds: number;
  assignments: ActiveAssignment[];
}

interface LiveStats {
  registered: number;
  arrived: number;
  seated_now: number;
  not_seated: number;
  likes_count: number;
  matches_count: number;
  active_round_number: number | null;
}

type Phase =
  | { kind: "loading" }
  | { kind: "ended" }
  | { kind: "active"; round: ActiveRound }
  | { kind: "draft"; draft: RoundDraft }
  | { kind: "idle" };


/** A seated person for the grid — name + avatar resolved from the attendee list. */
interface Seat {
  attendee_id: string;
  name: string;
  avatar_url: string | null;
}
function groupByTable(
  assignments: { attendee_id: string; table_number: number; name?: string }[],
  byId: Map<string, Attendee>,
): { table_number: number; seats: Seat[] }[] {
  const tables = new Map<number, Seat[]>();
  for (const a of assignments) {
    const info = byId.get(a.attendee_id);
    const seat: Seat = {
      attendee_id: a.attendee_id,
      name: a.name ?? info?.name ?? "(unknown)",
      avatar_url: info?.avatar_url ?? null,
    };
    if (!tables.has(a.table_number)) tables.set(a.table_number, []);
    tables.get(a.table_number)!.push(seat);
  }
  return [...tables.entries()]
    .sort(([a], [b]) => a - b)
    .map(([table_number, seats]) => ({
      table_number,
      seats: seats.sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

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

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (!busyRef.current) load();
    }, 12_000);
    return () => clearInterval(id);
  }, [user, load]);

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
          <div className="h-28 animate-pulse rounded-2xl border border-border bg-card/60" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
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
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || busy}
            aria-label="Refresh"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Arrived" value={stats?.arrived.toString() || arrivedCount.toString()} icon={Users} />
        <StatCard 
          label={phase.kind === "active" ? "Seated Now" : "Ready to Seat"} 
          value={phase.kind === "active" ? (stats?.seated_now.toString() || "0") : (stats?.arrived.toString() || arrivedCount.toString())} 
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
            arrivedCount={arrivedCount}
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
          />
        )}
        {phase.kind === "active" && (
          <ActiveView
            round={phase.round}
            byId={byId}
            busy={busy}
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

// --- Room check-in code (Phase 2) ---
// The ONLY place the room code is ever shown. Self-contained: owner-gated GET on
// mount, then open / regenerate / close. The value lives only on this organizer
// screen — it is never put in a link or QR, so pre-registered guests can only
// check themselves in once they're physically in the room reading it.
function RoomCodePanel({ eventId }: { eventId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ code: string | null }>(`/events/${eventId}/room-code`)
      .then((r) => !cancelled && setCode(r.code))
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function run(method: "POST" | "DELETE", path: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ code: string | null }>(path, { method });
      setCode(r.code);
      setCopied(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is on screen to read aloud anyway */
    }
  }

  if (!loaded) {
    return <div className="mb-6 h-24 animate-pulse rounded-2xl border border-border bg-card/60" />;
  }

  return (
    <Card className="mb-6 p-5 sm:p-6">
      {code ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> Room check-in code
            </div>
            <div className="mt-2 font-mono text-4xl font-semibold tracking-[0.3em] text-foreground sm:text-5xl">
              {code}
            </div>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Read it out or project it. Pre-registered guests type it to check themselves in. Don&apos;t share it before doors open.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="accent" size="lg" onClick={copy} disabled={busy} className="min-w-[7rem]">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="lg" onClick={() => run("POST", `/events/${eventId}/room-code/regenerate`)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              New code
            </Button>
            <Button variant="outline" size="lg" onClick={() => run("DELETE", `/events/${eventId}/room-code`)} disabled={busy}>
              <X className="h-4 w-4" aria-hidden /> Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <DoorOpen className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Open self-service check-in</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Generates a room code. Pre-registered guests type it to mark themselves arrived — no door queue.
              </p>
            </div>
          </div>
          <Button
            variant="accent"
            size="lg"
            onClick={() => run("POST", `/events/${eventId}/room-code/regenerate`)}
            disabled={busy}
            className="shrink-0"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            {busy ? "Opening…" : "Open check-in"}
          </Button>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {err}
        </p>
      )}
    </Card>
  );
}

// --- Phase: idle (no round running, no draft) ---
function IdleView({
  arrivedCount,
  busy,
  onStart,
  onEndEvent,
}: {
  arrivedCount: number;
  busy: boolean;
  onStart: () => void;
  onEndEvent: () => void;
}) {
  const tooFew = arrivedCount < 3;
  return (
    <div>
      <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
          <Radio className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-xl text-foreground">Ready when you are</h2>
        <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-muted-foreground">
          {tooFew
            ? `Mark at least 3 people as arrived in People before starting a round${arrivedCount > 0 ? ` — ${arrivedCount} so far` : ""}.`
            : "Generate a seating plan to preview. Attendees won't see anything until you publish it."}
        </p>
        <Button
          variant="accent"
          size="lg"
          onClick={onStart}
          disabled={busy || tooFew}
          className="mt-6 w-full sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {busy ? "Generating…" : "Generate round"}
        </Button>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <ConfirmButton
          label="End event"
          confirmLabel="End event for everyone?"
          icon={<Flag className="h-4 w-4" />}
          busy={busy}
          variant="danger"
          onConfirm={onEndEvent}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Closes the event and unlocks everyone&apos;s connections list. This can&apos;t be undone.
        </p>
      </div>
    </div>
  );
}

// --- Phase: draft (seating preview, not yet live) ---
function DraftView({
  draft,
  byId,
  busy,
  onPublish,
  onRegenerate,
}: {
  draft: RoundDraft;
  byId: Map<string, Attendee>;
  busy: boolean;
  onPublish: () => void;
  onRegenerate: () => void;
}) {
  const tables = groupByTable(draft.assignments, byId);
  const theme = roundFor(draft.round_number - 1);
  const seatsPerTable = Math.max(1, Math.ceil(draft.arrived_count / Math.max(1, draft.table_count)));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Left: round summary + controls */}
      <div className="space-y-4">
        <Card className="relative overflow-hidden p-6">
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-20 blur-3xl"
            style={{ background: theme.bg }}
            aria-hidden
          />
          <div className="relative">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">Preview — not published</p>
            <div className="mt-2.5 flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center rounded-2xl px-3 py-1.5 font-display text-3xl leading-none"
                style={{ background: theme.bg, color: theme.ink }}
              >
                R{draft.round_number}
              </span>
              <span className="truncate font-display text-2xl text-foreground">{theme.name}</span>
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">
              {draft.arrived_count} people · {draft.table_count} tables
            </p>
            <div className="mt-4">
              {draft.repeat_pairings > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {draft.repeat_pairings} repeat pairing{draft.repeat_pairings > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> All-new pairings
                </span>
              )}
            </div>
          </div>
        </Card>

        <NotSeated byId={byId} seatedIds={new Set(draft.assignments.map((a) => a.attendee_id))} />

        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Button variant="accent" size="lg" onClick={onPublish} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {busy ? "Publishing…" : "Publish round"}
          </Button>
          <Button variant="outline" size="lg" onClick={onRegenerate} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> Reshuffle
          </Button>
        </div>
      </div>

      {/* Right: floor map preview */}
      <Card className="p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          <MapPin className="h-4 w-4 text-accent" aria-hidden /> Floor map preview
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Tap a table to see who&apos;s seated. Nothing is live until you publish.</p>
        <FloorMap tables={tables} theme={theme} seatsPerTable={seatsPerTable} />
      </Card>
    </div>
  );
}

// --- A circular countdown ring (demo-style), driven by the real remaining secs. ---
function TimerRing({
  remaining,
  total,
  color,
  paused = false,
}: {
  remaining: number | null;
  total: number;
  color: string;
  paused?: boolean;
}) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const pct = remaining === null || total <= 0 ? 1 : Math.max(0, Math.min(1, remaining / total));
  const low = !paused && remaining !== null && remaining <= 30;
  const mm = remaining === null ? "--" : String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = remaining === null ? "--" : String(remaining % 60).padStart(2, "0");
  const ringColor = paused ? "hsl(var(--warning))" : color;
  return (
    <div className="relative h-24 w-24 shrink-0" role="timer" aria-live="polite">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ opacity: paused ? 0.6 : 1 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-mono text-lg tabular-nums", paused ? "text-warning" : low ? "text-accent" : "text-foreground")}>
          {mm}:{ss}
        </span>
        <span className="text-[9px] uppercase tracking-widest text-foreground-subtle">
          {paused ? "paused" : "left"}
        </span>
      </div>
    </div>
  );
}

// --- Phase: active (round live on attendee phones) ---
function ActiveView({
  round,
  byId,
  busy,
  onEnd,
  onCancel,
  onPause,
  onResume,
}: {
  round: ActiveRound;
  byId: Map<string, Attendee>;
  busy: boolean;
  onEnd: () => void;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const tables = groupByTable(round.assignments, byId);
  const theme = roundFor(round.round_number - 1);
  const seatsPerTable = Math.max(
    1,
    tables.reduce((m, t) => Math.max(m, t.seats.length), 0),
  );
  const paused = Boolean(round.paused_at);
  // Effective end shifts forward by banked paused time (backend migration 008).
  const endsAt = round.started_at
    ? new Date(
        Date.parse(round.started_at) +
          (round.duration_seconds + (round.total_paused_seconds || 0)) * 1000,
      ).toISOString()
    : null;
  const remaining = useCountdown(endsAt, new Date().toISOString(), undefined, round.paused_at);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Left: now playing + controls */}
      <div className="space-y-4">
        <Card className="relative overflow-hidden p-6">
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-25 blur-3xl"
            style={{ background: theme.bg }}
            aria-hidden
          />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-foreground-subtle">
                {paused ? (
                  <>
                    <Pause className="h-3 w-3 text-warning" aria-hidden /> Paused
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: theme.bg }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: theme.bg }} />
                    </span>
                    Now playing
                  </>
                )}
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center rounded-2xl px-3 py-1.5 font-display text-3xl leading-none"
                style={{ background: theme.bg, color: theme.ink }}
              >
                R{round.round_number}
              </span>
              <span className="truncate font-display text-2xl text-foreground">{theme.name}</span>
            </div>
            <div className="mt-5 flex items-center gap-5">
              <TimerRing remaining={remaining} total={round.duration_seconds} color={theme.bg} paused={paused} />
              <div className="text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden /> {tables.length} {tables.length === 1 ? "table" : "tables"}</div>
                <div className="mt-1.5 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden /> {round.assignments.length} seated now</div>
              </div>
            </div>
            {/* Pause / Resume — freezes everyone's countdown for announcements. */}
            <Button
              variant={paused ? "accent" : "outline"}
              size="lg"
              onClick={paused ? onResume : onPause}
              disabled={busy}
              className="mt-5 w-full"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : paused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
              {busy ? "Working…" : paused ? "Resume round" : "Pause round"}
            </Button>
          </div>
        </Card>

        <NotSeated byId={byId} seatedIds={new Set(round.assignments.map((a) => a.attendee_id))} />

        <div className="flex flex-col gap-3">
          <Button variant="accent" size="lg" onClick={onEnd} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            {busy ? "Ending…" : "End round"}
          </Button>
          <ConfirmButton
            label="Cancel round"
            confirmLabel="Discard this round?"
            icon={<Trash2 className="h-4 w-4" />}
            busy={busy}
            variant="danger"
            onConfirm={onCancel}
          />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">End round</span> keeps it in everyone&apos;s connections. <span className="font-medium text-foreground">Cancel</span> erases it.
          </p>
        </div>
      </div>

      {/* Right: live floor map */}
      <Card className="p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          <MapPin className="h-4 w-4 text-accent" aria-hidden /> Floor map
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Tap a table to see who&apos;s seated, or search for a person below.</p>
        <FloorMap tables={tables} theme={theme} seatsPerTable={seatsPerTable} />
      </Card>
    </div>
  );
}

// --- Phase: ended (post-event wrap + analytics) ---
interface Analytics {
  total_attendees: number;
  rounds_completed: number;
  avg_unique_people_met: number;
  total_likes: number;
  total_matches: number;
}
function EndedView({ eventId }: { eventId: string }) {
  const [stats, setStats] = useState<Analytics | null>(null);
  useEffect(() => {
    apiFetch<Analytics>(`/events/${eventId}/analytics`)
      .then(setStats)
      .catch(() => setStats(null));
  }, [eventId]);

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
        <Flag className="h-7 w-7" aria-hidden />
      </div>
      <h2 className="mt-6 font-display text-2xl text-foreground">This event has wrapped</h2>
      <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-muted-foreground">
        Rounds are closed and everyone&apos;s connections are unlocked.
      </p>

      {stats && (
        <dl className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-3">
          <Metric value={stats.total_attendees} label="attendees" />
          <Metric value={stats.rounds_completed} label={stats.rounds_completed === 1 ? "round" : "rounds"} />
          <Metric value={stats.avg_unique_people_met} label="avg met each" />
          <Metric value={stats.total_likes} label={stats.total_likes === 1 ? "like" : "likes"} />
          <Metric value={stats.total_matches} label={stats.total_matches === 1 ? "match" : "matches"} highlight />
          <Metric 
            value={stats.avg_unique_people_met > 0 ? Math.round((stats.avg_unique_people_met / Math.max(stats.total_attendees - 1, 1)) * 100) : 0} 
            label="% of room met" 
          />
        </dl>
      )}

      <div className="mt-8">
        <a href={`/organizer/event/${eventId}/people`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
          <Users className="h-4 w-4" aria-hidden /> View attendees
        </a>
      </div>
    </div>
  );
}

function Metric({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", highlight ? "border-accent/40 bg-accent/10" : "border-border bg-background/40")}>
      <dd className={cn("font-display text-2xl leading-none", highlight ? "text-accent" : "text-foreground")}>{value}</dd>
      <dt className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
    </div>
  );
}

// --- Shared: the floor map ---
// A spatial grid of tables (like standing in the room). Each tile is colored by
// how full it is, and tapping one reveals exactly who is seated there. A seat
// finder lets the organizer locate any person on the floor in one tap.
function FloorMap({
  tables,
  theme,
  seatsPerTable,
}: {
  tables: { table_number: number; seats: Seat[] }[];
  theme: Round;
  seatsPerTable: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return null;
    const set = new Set<number>();
    for (const t of tables) {
      if (t.seats.some((s) => s.name.toLowerCase().includes(query))) set.add(t.table_number);
    }
    return set;
  }, [query, tables]);

  const sel = tables.find((t) => t.table_number === selected) ?? null;

  if (tables.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No one is seated yet.</p>;
  }

  return (
    <div>
      {/* Seat finder + legend */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find where someone's sitting…"
            aria-label="Find where someone is sitting"
            className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Full</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: theme.bg }} /> Filling</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-line-strong" /> Open</span>
        </div>
      </div>

      {query && matches && matches.size === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">No one seated matches “{q}”.</p>
      )}

      {/* The floor */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {tables.map((t, i) => {
          const fill = t.seats.length;
          const ratio = seatsPerTable > 0 ? fill / seatsPerTable : 0;
          const color = ratio >= 1 ? "hsl(var(--success))" : ratio > 0 ? theme.bg : "hsl(var(--line-strong))";
          const isSel = selected === t.table_number;
          const dim = matches !== null && !matches.has(t.table_number);
          const hit = matches?.has(t.table_number) ?? false;
          return (
            <motion.button
              key={t.table_number}
              type="button"
              onClick={() => setSelected(isSel ? null : t.table_number)}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: dim ? 0.35 : 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              aria-pressed={isSel}
              aria-label={`Table ${t.table_number}, ${fill} ${fill === 1 ? "person" : "people"} seated`}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-2xl border bg-surface-2 transition-colors",
                isSel
                  ? "border-accent ring-2 ring-accent"
                  : hit
                    ? "border-accent"
                    : "border-border hover:border-line-strong",
              )}
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-20 blur-md" style={{ background: color }} aria-hidden />
              <span className="relative font-display text-2xl text-foreground">{String(t.table_number).padStart(2, "0")}</span>
              <div className="relative mt-1.5 flex flex-wrap justify-center gap-1">
                {Array.from({ length: seatsPerTable }).map((_, s) => (
                  <span key={s} className="h-1.5 w-1.5 rounded-full" style={{ background: s < fill ? color : "hsl(var(--line))" }} />
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected table roster */}
      <AnimatePresence initial={false}>
        {sel && (
          <motion.div
            key={sel.table_number}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-border bg-background/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 font-display text-sm"
                    style={{ background: theme.bg, color: theme.ink }}
                  >
                    Table {sel.table_number}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {sel.seats.length} {sel.seats.length === 1 ? "person" : "people"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close table"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sel.seats.map((s) => (
                  <li key={s.attendee_id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                    <Avatar name={s.name} seed={s.attendee_id} src={s.avatar_url} size={32} />
                    <span className="truncate text-sm text-foreground">{s.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Shared: people who've arrived but aren't seated this round ---
// Gives the organizer a glanceable rail of who to walk over to a table.
function NotSeated({ byId, seatedIds }: { byId: Map<string, Attendee>; seatedIds: Set<string> }) {
  const stragglers = [...byId.values()].filter(
    (a) => a.status === "arrived" && !seatedIds.has(a.id),
  );
  if (stragglers.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
        <Armchair className="h-4 w-4 text-warning" aria-hidden /> Not seated
        <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
          {stragglers.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {stragglers.map((a) => (
          <li
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-2.5"
          >
            <Avatar name={a.name} seed={a.id} src={a.avatar_url} size={20} />
            <span className="text-xs text-foreground">{a.name}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Shared: two-step confirm button ---
function ConfirmButton({
  label,
  confirmLabel,
  icon,
  busy,
  variant,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  icon: React.ReactNode;
  busy: boolean;
  variant: "danger";
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size="lg"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          {confirmLabel}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setArmed(false)} disabled={busy}>
          Keep
        </Button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "danger" && "border-destructive/30 text-destructive hover:bg-destructive/10",
      )}
    >
      {icon} {label}
    </button>
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
