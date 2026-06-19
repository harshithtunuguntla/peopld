"use client";

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
  AlertTriangle,
  CheckCircle2,
  MapPin,
} from "lucide-react";

import { Card } from "@/components/organizer/console-ui";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/components/live/countdown";
import { roundFor, agendaFor } from "@/lib/design/rounds";

import dynamic from "next/dynamic";

import { groupByTable, type Attendee, type RoundDraft, type ActiveRound } from "./types";
import { FloorMap, TimerRing } from "./floor-map";
import { NotSeated, Guests } from "./rails";
import { ConfirmButton } from "./confirm-button";

// The recap pulls in recharts (~100kB). Organizers only see it AFTER an event
// ends, so lazy-load it — keep the live command center (used during the event)
// lean. ssr:false because recharts is client-only.
const EventRecap = dynamic(() => import("./recap").then((m) => m.EventRecap), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-2xl border border-border" />,
});

// --- Phase: idle (no round running, no draft) — also the BETWEEN-ROUNDS state ---
export function IdleView({
  arrivedCount,
  roundsCompleted,
  targetRounds,
  roundTopics,
  busy,
  onStart,
  onEndEvent,
}: {
  arrivedCount: number;
  roundsCompleted: number;
  targetRounds: number | null;
  roundTopics: string[];
  busy: boolean;
  onStart: () => void;
  onEndEvent: () => void;
}) {
  const tooFew = arrivedCount < 3;
  // Between rounds, name what just finished and what's next so the host isn't
  // guessing. The next round number is "completed + 1"; its theme comes from the
  // organizer agenda (round_topics) when set, else the canonical palette.
  const between = roundsCompleted > 0;
  const isFinal = targetRounds != null && roundsCompleted >= targetRounds;
  const nextNumber = roundsCompleted + 1;
  const nextTheme = agendaFor(nextNumber - 1, roundTopics);
  return (
    <div>
      {between && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Round {roundsCompleted}
            {targetRounds ? ` of ${targetRounds}` : ""} complete
          </span>
          {!isFinal && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              Next up
              <span
                className="inline-flex items-center justify-center rounded-lg px-2 py-0.5 font-display text-sm leading-none"
                style={{ background: nextTheme.bg, color: nextTheme.ink }}
              >
                R{nextNumber}
              </span>
              <span className="font-medium text-foreground">{nextTheme.name}</span>
            </span>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
          <Radio className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-xl text-foreground">
          {between ? (isFinal ? "All rounds done" : "Ready for the next round") : "Ready when you are"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-balance text-sm text-muted-foreground">
          {tooFew
            ? `Mark at least 3 people as arrived in People before starting a round${arrivedCount > 0 ? ` — ${arrivedCount} so far` : ""}.`
            : between
              ? `Generate the seating for round ${nextNumber} to preview. Attendees see the "round complete" screen until you publish it.`
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
          {busy ? "Generating…" : between ? `Generate round ${nextNumber}` : "Generate round"}
        </Button>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <ConfirmButton
          label="End event"
          confirmLabel="Yes, end for everyone — can't be undone"
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
export function DraftView({
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
        <Guests byId={byId} />

        <div className="space-y-2.5">
          <Button
            variant="accent"
            size="lg"
            onClick={onPublish}
            disabled={busy}
            className="h-14 w-full justify-center gap-2 rounded-2xl text-base font-semibold shadow-lg shadow-accent/25 ring-1 ring-inset ring-white/10 transition-transform hover:-translate-y-0.5"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            {busy ? "Publishing…" : "Publish round — go live"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Seats appear on every phone instantly. You can still end or cancel after.
          </p>
          <Button variant="outline" size="lg" onClick={onRegenerate} disabled={busy} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden /> Reshuffle seating
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

// --- Phase: active (round live on attendee phones) ---
export function ActiveView({
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
        <Guests byId={byId} />

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
// The rich recap (bento + charts + top connectors) lives in ./recap to keep this
// file lean and isolate the recharts import to the one screen that needs it.
export function EndedView({ eventId }: { eventId: string }) {
  return <EventRecap eventId={eventId} />;
}
