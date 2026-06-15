"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Play,
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
} from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { OrgShell } from "@/components/organizer/shell";
import { Avatar } from "@/components/brand/avatar";
import { Button } from "@/components/ui/button";
import { CountdownPill, useCountdown } from "@/components/live/countdown";
import { roundFor } from "@/lib/design/rounds";
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
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Polling must read the latest "is an action in flight?" without re-arming the
  // interval each render — a ref keeps the closure fresh.
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [ev, people] = await Promise.all([
        apiFetch<EventInfo>(`/events/${eventId}`),
        apiFetch<Attendee[]>(`/events/${eventId}/attendees`),
      ]);
      setEvent(ev);
      setAttendees(people);
      // Room pulse — best-effort, never blocks the control room if it hiccups.
      apiFetch<LiveStats>(`/events/${eventId}/live-stats`).then(setStats).catch(() => {});

      if (ev.status === "ended") {
        setPhase({ kind: "ended" });
        return;
      }
      // Active round wins; else a pending draft; else idle.
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
      setError(e instanceof Error ? e.message : "Couldn't load the control room");
    }
  }, [eventId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Live "room pulse": keep arrivals / likes / matches fresh during the event.
  // Skip ticks while an action is mid-flight so we never clobber an in-progress
  // start/publish/end with a stale snapshot.
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

  /** Run an action, then re-sync to the authoritative server state. */
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

  if (!checked || !user || phase.kind === "loading") {
    return (
      <OrgShell back={{ href: "/organizer/dashboard", label: "All events" }}>
        <div className="space-y-3">
          <div className="h-9 w-48 animate-pulse rounded-lg bg-card/60" />
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card/40" />
        </div>
      </OrgShell>
    );
  }

  return (
    <OrgShell back={{ href: "/organizer/dashboard", label: "All events" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl tracking-[-0.02em] text-foreground">Control room</h1>
          {event && <p className="truncate text-sm text-muted-foreground">{event.name}</p>}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || busy}
          aria-label="Refresh"
          title="Refresh"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
        </button>
      </div>

      <PulseStrip stats={stats} arrivedFallback={arrivedCount} roundActive={phase.kind === "active"} />

      {error && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div className="mt-5">
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
          />
        )}
      </div>
    </OrgShell>
  );
}

// --- Room pulse: live counts the organizer watches during the event ---
function PulseStrip({
  stats,
  arrivedFallback,
  roundActive,
}: {
  stats: LiveStats | null;
  arrivedFallback: number;
  roundActive: boolean;
}) {
  if (!stats) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" aria-hidden />
        <span><span className="font-medium text-foreground">{arrivedFallback}</span> arrived &amp; ready to seat</span>
      </div>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <PulseCard icon={<Users className="h-4 w-4" />} value={stats.arrived} label="arrived" />
      {roundActive ? (
        <PulseCard icon={<Armchair className="h-4 w-4" />} value={stats.seated_now} label="seated now" />
      ) : (
        <PulseCard icon={<Armchair className="h-4 w-4" />} value={stats.arrived} label="ready to seat" />
      )}
      <PulseCard icon={<Heart className="h-4 w-4" />} value={stats.likes_count} label="likes" />
      <PulseCard
        icon={<Sparkles className="h-4 w-4" />}
        value={stats.matches_count}
        label="matches"
        highlight={stats.matches_count > 0}
      />
    </div>
  );
}

function PulseCard({
  icon,
  value,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2", highlight ? "border-accent/40 bg-accent/10" : "border-border bg-card/40")}>
      <span className={cn(highlight ? "text-accent" : "text-muted-foreground")}>{icon}</span>
      <span className="leading-tight">
        <span className="block font-display text-lg text-foreground">{value}</span>
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </span>
    </div>
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
  const tooFew = arrivedCount < 2;
  return (
    <div>
      <div className="rounded-2xl border border-border bg-card/50 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
          <Radio className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-xl text-foreground">Ready when you are</h2>
        <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-muted-foreground">
          {tooFew
            ? "Mark at least two people as arrived in People before starting a round."
            : "Generate a seating plan to preview. Attendees won't see anything until you publish it."}
        </p>
        <Button
          variant="accent"
          size="lg"
          onClick={onStart}
          disabled={busy || tooFew}
          className="glow-ember mt-5 w-full sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {busy ? "Generating…" : "Generate round"}
        </Button>
      </div>

      <div className="mt-6 border-t border-border pt-5">
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
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-accent/40 bg-accent/5 p-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Preview — not published</p>
          <h2 className="mt-1 font-display text-lg text-foreground">
            Round {draft.round_number} · {theme.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.arrived_count} people · {draft.table_count} tables
          </p>
        </div>
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

      <TableGrid tables={tables} theme={theme} />

      <div className="sticky bottom-4 mt-6 flex gap-2.5">
        <Button variant="accent" size="lg" onClick={onPublish} disabled={busy} className="glow-ember flex-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {busy ? "Publishing…" : "Publish round"}
        </Button>
        <Button variant="outline" size="lg" onClick={onRegenerate} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Reshuffle
        </Button>
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
}: {
  round: ActiveRound;
  byId: Map<string, Attendee>;
  busy: boolean;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const tables = groupByTable(round.assignments, byId);
  const theme = roundFor(round.round_number - 1);
  const endsAt = round.started_at
    ? new Date(Date.parse(round.started_at) + round.duration_seconds * 1000).toISOString()
    : null;
  const remaining = useCountdown(endsAt, new Date().toISOString());

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Live now</p>
            <h2 className="font-display text-lg text-foreground">
              Round {round.round_number} · {theme.name}
            </h2>
          </div>
        </div>
        <CountdownPill remaining={remaining} />
      </div>

      <TableGrid tables={tables} theme={theme} />

      <div className="sticky bottom-4 mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Button variant="accent" size="lg" onClick={onEnd} disabled={busy} className="flex-1">
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
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">End round</span> keeps it in everyone&apos;s connections. <span className="font-medium text-foreground">Cancel</span> erases it — use it only if the seating was wrong.
      </p>
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
      .catch(() => setStats(null)); // analytics are a bonus — never block the wrap screen
  }, [eventId]);

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
        <Flag className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="mt-4 font-display text-xl text-foreground">This event has wrapped</h2>
      <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-muted-foreground">
        Rounds are closed and everyone&apos;s connections are unlocked. Here&apos;s how the room connected.
      </p>

      {stats && (
        <dl className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2.5">
          <Metric value={stats.total_attendees} label="attendees" />
          <Metric value={stats.rounds_completed} label={stats.rounds_completed === 1 ? "round" : "rounds"} />
          <Metric value={stats.avg_unique_people_met} label="avg met each" />
          <Metric value={stats.total_likes} label={stats.total_likes === 1 ? "like" : "likes"} />
          <Metric value={stats.total_matches} label={stats.total_matches === 1 ? "match" : "matches"} highlight />
          <Metric value={stats.avg_unique_people_met > 0 ? Math.round((stats.avg_unique_people_met / Math.max(stats.total_attendees - 1, 1)) * 100) : 0} label="% of room met" />
        </dl>
      )}

      <a
        href={`/organizer/event/${eventId}/people`}
        className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Users className="h-4 w-4" aria-hidden /> View attendees
      </a>
    </div>
  );
}

function Metric({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3", highlight ? "border-accent/40 bg-accent/10" : "border-border bg-background/40")}>
      <dd className={cn("font-display text-2xl leading-none", highlight ? "text-accent" : "text-foreground")}>{value}</dd>
      <dt className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
    </div>
  );
}

// --- Shared: the table grid (responsive, color-per-round headers) ---
function TableGrid({
  tables,
  theme,
}: {
  tables: { table_number: number; seats: Seat[] }[];
  theme: { bg: string; ink: string };
}) {
  if (tables.length === 0) {
    return <p className="mt-6 text-center text-sm text-muted-foreground">No one is seated yet.</p>;
  }
  return (
    <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tables.map((t) => (
        <li key={t.table_number} className="overflow-hidden rounded-2xl border border-border bg-card/50">
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ backgroundColor: theme.bg, color: theme.ink }}
          >
            <span className="font-display text-sm font-semibold">Table {t.table_number}</span>
            <span className="text-xs opacity-80">{t.seats.length} {t.seats.length === 1 ? "person" : "people"}</span>
          </div>
          <ul className="divide-y divide-border">
            {t.seats.map((s) => (
              <li key={s.attendee_id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar name={s.name} seed={s.attendee_id} src={s.avatar_url} size={32} />
                <span className="truncate text-sm text-foreground">{s.name}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

// --- Shared: two-step confirm button for destructive actions ---
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
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "danger" && "border-destructive/30 text-destructive hover:bg-destructive/10",
      )}
    >
      {icon} {label}
    </button>
  );
}
