"use client";

import { useRef, useState } from "react";
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
  Clock,
  Plus,
  Zap,
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
            : isFinal
              ? `You've run all ${targetRounds} planned rounds. Wrap up to unlock everyone's connections — or add one more if the room's still buzzing.`
              : between
                ? `Generate the seating for round ${nextNumber} to preview. Attendees see the "round complete" screen until you publish it.`
                : "Generate a seating plan to preview. Attendees won't see anything until you publish it."}
        </p>
        {isFinal ? (
          // All planned rounds done: wrapping up is the obvious next step, so it's
          // the primary action here; a bonus round is the quiet secondary path.
          <div className="mt-6 flex flex-col items-center gap-3">
            <ConfirmButton
              label="Wrap up event"
              confirmLabel="Yes, end for everyone — unlocks connections"
              icon={<Flag className="h-4 w-4" />}
              busy={busy}
              variant="danger"
              onConfirm={onEndEvent}
            />
            <button
              type="button"
              onClick={onStart}
              disabled={busy || tooFew}
              className="text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              or add a bonus round
            </button>
          </div>
        ) : (
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
        )}
      </div>

      {/* Mid-event, ending is always available as a quiet danger-zone action.
          Once all planned rounds are done it's promoted into the hero above, so
          we drop the duplicate here. */}
      {!isFinal && (
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
      )}
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
  onMove,
  onAddTable,
}: {
  draft: RoundDraft;
  byId: Map<string, Attendee>;
  busy: boolean;
  onPublish: () => void;
  onRegenerate: () => void;
  onMove: (attendeeId: string, tableNumber: number) => void;
  onAddTable: () => void;
}) {
  const tables = groupByTable(draft.assignments, byId);
  const theme = roundFor(draft.round_number - 1);
  const seatsPerTable = Math.max(1, Math.ceil(draft.arrived_count / Math.max(1, draft.table_count)));
  const warn = draft.capacity_warning;
  return (
    <>
    {warn && (
      <div
        role="status"
        className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-foreground">
              Tight on space — {warn.seated} people, {warn.capacity} comfortable seats
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {warn.overfilled_tables} table{warn.overfilled_tables > 1 ? "s" : ""} go past your max of{" "}
              {warn.max_per_table} (up to {warn.biggest_table} per table). Everyone&apos;s still seated —
              add a table to spread them out, or publish to keep the squeeze.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddTable}
          disabled={busy}
          className="mt-3 w-full shrink-0 gap-1.5 border-warning/40 sm:mt-0 sm:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a table
        </Button>
      </div>
    )}
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
            {busy ? "Publishing…" : "Publish seating"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Tables appear on every phone instantly. The timer doesn&apos;t start yet —
            you&apos;ll hit <span className="font-medium text-foreground">Start round</span> once
            everyone&apos;s seated.
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
        <p className="mb-4 text-xs text-muted-foreground">
          Tap a table to see who&apos;s seated — then move anyone to another table to fine-tune the plan.
          Nothing is live until you publish.
        </p>
        <FloorMap tables={tables} theme={theme} seatsPerTable={seatsPerTable} onMovePerson={onMove} moveBusy={busy} />
      </Card>
    </div>
    </>
  );
}

// Quick "+ Add time" control: one-tap presets plus a custom minutes field. Shown
// while a round is running so the host can grant more time without ever pausing.
function AddTimeControl({ busy, onExtend }: { busy: boolean; onExtend: (seconds: number) => void }) {
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState("");

  function applyCustom() {
    const m = parseFloat(mins);
    if (!Number.isFinite(m) || m <= 0) return;
    onExtend(Math.round(m * 60));
    setMins("");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="lg" onClick={() => setOpen(true)} disabled={busy} className="w-full gap-2">
        <Clock className="h-4 w-4" aria-hidden /> Add time
      </Button>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Add time to this round</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 5].map((m) => (
          <Button key={m} variant="outline" size="sm" onClick={() => onExtend(m * 60)} disabled={busy} className="gap-1">
            <Plus className="h-3.5 w-3.5" aria-hidden /> {m} min
          </Button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            value={mins}
            onChange={(e) => setMins(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            inputMode="decimal"
            placeholder="custom"
            aria-label="Custom minutes to add"
            className="h-9 w-20 rounded-lg border border-input bg-secondary/50 px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button variant="accent" size="sm" onClick={applyCustom} disabled={busy || !mins}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Phase: active — covers BOTH "published, waiting to start" (started_at null)
// and "running" (timer ticking). Publishing reveals the seating; the organizer
// hits Start round to begin the clock for everyone. ---
export function ActiveView({
  round,
  byId,
  busy,
  autoAdvance,
  onBegin,
  onExtend,
  onEnd,
  onCancel,
  onPause,
  onResume,
}: {
  round: ActiveRound;
  byId: Map<string, Attendee>;
  busy: boolean;
  autoAdvance: boolean;
  onBegin: () => void;
  onExtend: (seconds: number) => void;
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
  const started = Boolean(round.started_at);
  const paused = Boolean(round.paused_at);
  // Effective end shifts forward by banked paused time (backend migration 008).
  const endsAt = round.started_at
    ? new Date(
        Date.parse(round.started_at) +
          (round.duration_seconds + (round.total_paused_seconds || 0)) * 1000,
      ).toISOString()
    : null;
  // When the timer hits zero AND auto-advance is on, the console ends the round
  // itself — this is the "lazy-poll" auto-end (driven by the open console, which
  // is the single authority, so no 40-phone race). The manual End button always
  // works too. Paused / not-yet-started rounds never auto-end (endsAt is null or
  // the countdown is frozen). The ref guards against the countdown effect
  // re-running at zero and firing /end twice for the same round.
  const autoEndedRef = useRef<string | null>(null);
  const onExpire = () => {
    if (!autoAdvance || !started || paused) return;
    if (autoEndedRef.current === round.id) return;
    autoEndedRef.current = round.id;
    onEnd();
  };
  const remaining = useCountdown(endsAt, new Date().toISOString(), onExpire, round.paused_at);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Left: now playing / waiting-to-start + controls */}
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
                {!started ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-success" aria-hidden /> Published · waiting to start
                  </>
                ) : paused ? (
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

            {started ? (
              <>
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
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-muted-foreground">
                  {round.assignments.length} people are seated across {tables.length}{" "}
                  {tables.length === 1 ? "table" : "tables"}. They can see their table now — start the
                  round once everyone&apos;s found their seat.
                </p>
                <Button
                  variant="accent"
                  size="lg"
                  onClick={onBegin}
                  disabled={busy}
                  className="mt-5 h-14 w-full justify-center gap-2 rounded-2xl text-base font-semibold shadow-lg shadow-accent/25 ring-1 ring-inset ring-white/10 transition-transform hover:-translate-y-0.5"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                  {busy ? "Starting…" : `Start round — ${Math.max(1, Math.round(round.duration_seconds / 60))} min`}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Starts the timer for everyone at once.
                </p>
              </>
            )}
          </div>
        </Card>

        <NotSeated byId={byId} seatedIds={new Set(round.assignments.map((a) => a.attendee_id))} />
        <Guests byId={byId} />

        <div className="flex flex-col gap-3">
          {started && (
            <>
              <Button variant="accent" size="lg" onClick={onEnd} disabled={busy} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                {busy ? "Ending…" : "End round"}
              </Button>
              <AddTimeControl busy={busy} onExtend={onExtend} />
            </>
          )}
          <ConfirmButton
            label="Cancel round"
            confirmLabel="Discard this round?"
            icon={<Trash2 className="h-4 w-4" />}
            busy={busy}
            variant="danger"
            onConfirm={onCancel}
          />
          <p className="text-xs text-muted-foreground">
            {started ? (
              <>
                <span className="font-medium text-foreground">End round</span> keeps it in everyone&apos;s connections. <span className="font-medium text-foreground">Cancel</span> erases it.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Cancel</span> discards this seating without it ever counting — use it if you published the wrong plan.
              </>
            )}
          </p>
          {started && autoAdvance && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> Auto-ends when the timer runs out. Keep this page open.
            </p>
          )}
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
