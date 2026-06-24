"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CalendarX2, Loader2, Sparkles, Heart, Users, ArrowRight, DoorOpen, UserCheck, RefreshCw, StickyNote, Check, Star, MapPin } from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { Wordmark } from "@/components/brand/wordmark";
import { BoardingPass } from "@/components/brand/boarding-pass";
import { Avatar } from "@/components/brand/avatar";
import { AccountMenu } from "@/components/attendee/account-menu";
import { IcebreakerCard } from "@/components/brand/icebreaker-card";
import { buttonVariants } from "@/components/ui/button";
import { ROUNDS, agendaFor, type Round } from "@/lib/design/rounds";
import { COLORS } from "@/lib/design/colors";
import { cn } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/api";
import { CountdownPill, useCountdown } from "./countdown";
import type { LiveState, Tablemate } from "@/lib/live/use-live-state";
import { useEventBranding, type Sponsor } from "@/lib/live/use-branding";
import { SponsorShowcase, EventLogo, WaitingStage } from "./sponsor-showcase";

/** One tablemate, with a like (❤️) toggle and a private-note affordance. Likes
 * persist and surface in the rolodex later (mutual = a match); notes are
 * author-private and pre-fill from the snapshot. Both optimistic-ish, with the
 * note saving on blur. */
function TablemateRow({
  mate,
  eventId,
  notesOpen,
  onToggleNotes,
}: {
  mate: Tablemate;
  eventId: string;
  notesOpen: boolean;
  onToggleNotes: () => void;
}) {
  const [liked, setLiked] = useState(mate.liked);
  const [pending, setPending] = useState(false);

  // Private note — collapsed by default; the parent keeps only one row open.
  const [note, setNote] = useState(mate.note ?? "");
  const [savedNote, setSavedNote] = useState(mate.note ?? "");
  const [showSaved, setShowSaved] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNote = savedNote.trim().length > 0;
  const noteDirty = note.trim() !== savedNote.trim();

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  async function toggle() {
    if (pending) return;
    const next = !liked;
    setLiked(next); // optimistic
    setPending(true);
    try {
      if (next) {
        await apiFetch(`/events/${eventId}/likes`, {
          method: "POST",
          body: JSON.stringify({ target_attendee_id: mate.attendee_id }),
        });
      } else {
        await apiFetch(`/events/${eventId}/likes/${mate.attendee_id}`, { method: "DELETE" });
      }
    } catch {
      setLiked(!next); // revert
    } finally {
      setPending(false);
    }
  }

  async function saveNote() {
    if (!noteDirty) return; // nothing changed → no write
    setNoteBusy(true);
    try {
      await apiFetch(`/events/${eventId}/notes/${mate.attendee_id}`, {
        method: "PUT",
        body: JSON.stringify({ note: note.trim() }),
      });
      setSavedNote(note.trim());
      setShowSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 1000);
    } catch {
      // keep the text so the user can retry; nothing destructive happened
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <li className={cn("rounded-2xl border bg-card/50 p-3", mate.wanted ? "border-accent/50 bg-accent/[0.06]" : "border-border")}>
      <div className="flex items-center gap-3">
        <Avatar name={mate.name} seed={mate.attendee_id} src={mate.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium text-foreground">{mate.name}</p>
            {mate.wanted && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                <UserCheck className="h-2.5 w-2.5" aria-hidden /> You wanted to meet
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{[mate.role, mate.company].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleNotes}
            aria-pressed={notesOpen}
            aria-label={hasNote ? `Edit your note about ${mate.name}` : `Add a private note about ${mate.name}`}
            title="Private note — only you see this"
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
              hasNote || notesOpen ? "border-accent/40 bg-accent/15 text-accent" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <StickyNote className="h-4 w-4" aria-hidden />
            {hasNote && !notesOpen && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-card" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={liked}
            aria-label={liked ? `Unlike ${mate.name}` : `Like ${mate.name}`}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-60",
              liked ? "border-accent/40 bg-accent/15 text-accent" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Heart className={cn("h-4 w-4", liked && "fill-current")} aria-hidden />
          </button>
        </div>
      </div>

      {mate.shared_interests.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[52px]">
          <span className="text-[10px] uppercase tracking-wide text-accent/80">Both into</span>
          {mate.shared_interests.map((tag) => (
            <span key={tag} className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
              {tag}
            </span>
          ))}
        </div>
      )}
      {mate.looking_for && (
        <p className="mt-2 pl-[52px] text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">Looking for:</span> {mate.looking_for}
        </p>
      )}

      {notesOpen && (
        <div className="mt-3 pl-[52px]">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <StickyNote className="h-3 w-3" aria-hidden /> Private note · only you see this
          </label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (showSaved) setShowSaved(false);
            }}
            onBlur={saveNote}
            rows={2}
            maxLength={500}
            autoFocus
            placeholder="e.g. follow up about hiring · intro to Priya"
            className="mt-1.5 w-full resize-none rounded-xl border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <div className="mt-1 flex h-4 items-center justify-end text-[11px] text-muted-foreground">
            {noteBusy ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…</span>
            ) : noteDirty ? (
              <span>Tap outside to save</span>
            ) : showSaved ? (
              <span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" aria-hidden /> Saved</span>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}

/** Dark shell shared by every live phase: aurora bg, grid, wordmark top bar.
 * Pass `eventId` to show a profile shortcut in the top bar. */
export function LiveShell({
  children,
  right,
  eventId,
  eventName,
  onRefresh,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  eventId?: string;
  /** The event's name — shown as a small eyebrow under the top bar so an attendee
   *  always knows which event they're in, on every live phase (waiting → rounds). */
  eventName?: string;
  /** When set, shows a manual "refresh" button — a safety net for when the
   *  realtime doorbell doesn't fire, so the attendee can re-pull their state
   *  without reloading the whole page. */
  onRefresh?: () => void;
  className?: string;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.4} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />
      <div className={cn("relative z-10 mx-auto flex w-full max-w-md flex-col px-5 pb-16 pt-7", className)}>
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            aria-label="Go to Peopld home"
            className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Wordmark size={24} />
          </Link>
          <div className="flex items-center gap-3">
            {right}
            {onRefresh && <RefreshButton onRefresh={onRefresh} />}
            {eventId && (
              <AccountMenu
                editProfileHref={`/event/${eventId}/profile`}
                connectionsHref={`/event/${eventId}/connections`}
                buttonSize="sm"
              />
            )}
          </div>
        </div>
        {eventName && (
          <p className="mt-2.5 flex items-center gap-1.5 truncate text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-accent" aria-hidden />
            <span className="truncate">{eventName}</span>
          </p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

/** Manual re-fetch affordance. Spins briefly on tap for feedback, and is
 *  debounced so an impatient double-tap can't fire a burst of requests. */
function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      type="button"
      aria-label="Refresh"
      title="Refresh"
      disabled={spinning}
      onClick={() => {
        if (spinning) return;
        setSpinning(true);
        onRefresh();
        setTimeout(() => setSpinning(false), 800);
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} aria-hidden />
    </button>
  );
}

/** Shared centered message used by the "waiting"-style phases. */
function StatusPanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center">
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card/60 text-accent">
          {icon}
        </div>
        <span className="absolute inset-0 -z-10 rounded-full bg-accent/20 blur-xl" aria-hidden />
      </div>
      <div>
        <h1 className="font-display text-2xl text-foreground">{title}</h1>
        <p className="mt-2 text-balance text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

/** Roster avatar stack — real faces of who's already in the room (capped + "+N"). */
function RoomRoster({ roster }: { roster: LiveState["roster"] }) {
  const { count, preview } = roster;
  const overflow = count - preview.length;
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {count === 1 ? "1 in the room" : `${count} in the room`}
        </span>
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
      </div>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re the first one here. Others will appear as they check in.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-y-2">
          <div className="flex -space-x-2.5">
            {preview.map((p) => (
              <div key={p.attendee_id} className="rounded-full ring-2 ring-background">
                <Avatar name={p.name} seed={p.attendee_id} src={p.avatar_url} size={32} />
              </div>
            ))}
            {overflow > 0 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-background">
                +{overflow}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The "Tonight" agenda — the planned rounds and their themes. Names come from the
 * organizer-authored agenda (event.round_topics) when set, else the canonical set. */
function AgendaCard({
  targetRounds,
  roundSeconds,
  topics,
}: {
  targetRounds: number | null;
  roundSeconds: number;
  topics?: string[];
}) {
  const count = targetRounds && targetRounds > 0 ? targetRounds : ROUNDS.length;
  const minutes = Math.max(1, Math.round(roundSeconds / 60));
  const rounds = Array.from({ length: count }, (_, i) => ({ n: i + 1, ...agendaFor(i, topics) }));
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Tonight</span>
        <span className="text-[11px] text-muted-foreground">
          {count} {count === 1 ? "round" : "rounds"} · {minutes} min
        </span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {rounds.map((r, i) => (
          <li key={r.n} className="flex items-center gap-2.5 text-sm">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
              style={{ background: r.bg, color: r.ink }}
            >
              {r.n}
            </span>
            <span className={cn("truncate", i === 0 ? "text-foreground" : "text-muted-foreground")}>{r.name}</span>
            {i === 0 && <span className="ml-auto shrink-0 text-[10px] font-medium text-success">Up next</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The sponsor flip in its one consistent carded frame — used identically by every
 * lobby / waiting / between-rounds screen so the brand moment looks the same all
 * the way through the event. Renders nothing when no sponsors are authored (never
 * an empty ad box). */
function SponsorBlock({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <SponsorShowcase sponsors={sponsors} />
    </div>
  );
}

export function WaitingRoom({ state, eventId }: { state: LiveState; eventId?: string }) {
  // Defensive: tolerate an older backend that doesn't yet send these fields.
  const firstName = (state.attendee_name ?? "").trim().split(/\s+/)[0] || "there";
  const roster = state.roster ?? { count: 0, preview: [] };
  const branding = useEventBranding(eventId);
  const sponsors = branding?.sponsors ?? [];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {/* Translucent "live" badge — design-system success token, demo-style, with
            a soft glow + pulsing dot so it reads alive without going solid. */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-inset ring-success/25 shadow-[0_0_16px_-4px_hsl(var(--success)/0.55)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
          You&apos;re in
        </span>
        <span className="truncate text-xs text-muted-foreground">Hi, {firstName}</span>
      </div>

      <div className="flex flex-col items-center pt-2 text-center">
        <EventLogo branding={branding} className="mb-4" />
        <WaitingStage sponsors={sponsors} hourglassSize={120} />
        <h1 className="mt-3 font-display text-2xl text-foreground">The room is filling up</h1>
        <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
          <span className="block">Grab a drink and say hi to someone new.</span>
          <span className="block">We&apos;ll light up this screen the moment your table&apos;s ready.</span>
        </p>
      </div>

      <AgendaCard
        targetRounds={state.target_rounds ?? null}
        roundSeconds={state.round_seconds ?? 300}
        topics={state.round_topics}
      />
      <RoomRoster roster={roster} />
      {eventId && <DirectoryLink eventId={eventId} />}
    </div>
  );
}

/** "See who's coming" — links to the pre-event directory. Shown in the lobby
 * (waiting room + check-in) so people can browse the guest list while they wait. */
function DirectoryLink({ eventId }: { eventId: string }) {
  return (
    <Link
      href={`/event/${eventId}/directory`}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.06]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Users className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">See who&apos;s coming</span>
        <span className="block text-xs text-muted-foreground">Browse the guest list and find people to meet.</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/**
 * Self-service day-of check-in. A pre-registered attendee (status 'registered',
 * not yet 'arrived') types the ROOM code the organizer reveals in the room to
 * flip themselves to 'arrived' and join the seating pool. The code is a secret
 * separate from the join code — it is shown only at the venue, never in a link.
 */
export function RoomCodeCheckIn({
  state,
  eventId,
  onArrived,
}: {
  state: LiveState;
  eventId: string;
  onArrived: () => void;
}) {
  const firstName = (state.attendee_name ?? "").trim().split(/\s+/)[0] || "there";
  const returning = state.attendee_status === "left"; // stepped out / marked gone → re-checking in
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const room_code = code.trim();
    if (!room_code || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/events/${eventId}/attendees/me/arrive`, {
        method: "POST",
        body: JSON.stringify({ room_code }),
      });
      onArrived(); // refetch → status flips to 'arrived', the waiting room takes over
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("That code isn't right. Check the screen at the venue and try again.");
      } else if (err instanceof ApiError && err.status === 409) {
        // server message covers "check-in isn't open yet" and "event ended"
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't check you in — try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent ring-1 ring-inset ring-accent/25">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {returning ? "Welcome back" : "You're registered"}
        </span>
        <span className="truncate text-xs text-muted-foreground">Hi, {firstName}</span>
      </div>

      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card/60 text-accent">
            <DoorOpen className="h-7 w-7" aria-hidden />
          </div>
          <span className="absolute inset-0 -z-10 rounded-2xl bg-accent/20 blur-xl" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl text-foreground">
          {returning ? "Ready to rejoin?" : "You're on the list"}
        </h1>
        <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
          {returning ? (
            <>Enter the <span className="text-foreground">room code</span> shown at the venue to check back in and be seated in the next round.</>
          ) : (
            <>When you arrive, enter the <span className="text-foreground">room code</span> shown at the venue to check in and join the first round.</>
          )}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (error) setError(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          maxLength={8}
          placeholder="ENTER CODE"
          aria-label="Room code"
          aria-invalid={Boolean(error)}
          className="h-16 w-full rounded-2xl border border-border bg-card text-center font-mono text-3xl font-semibold uppercase tracking-[0.4em] text-foreground outline-none transition-colors placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus:border-accent"
        />
        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className={cn(
            buttonVariants({ variant: "accent", size: "lg" }),
            "glow-ember w-full disabled:opacity-50",
          )}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <DoorOpen className="h-4 w-4" aria-hidden />}
          {submitting ? "Checking you in…" : "Check in"}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Don&apos;t have it yet? The host will share the code once doors open.
      </p>

      <DirectoryLink eventId={eventId} />
    </div>
  );
}

export function BetweenRounds({ state, eventId }: { state: LiveState; eventId?: string }) {
  const branding = useEventBranding(eventId);
  const sponsors = branding?.sponsors ?? [];
  const [openNoteAttendeeId, setOpenNoteAttendeeId] = useState<string | null>(null);

  // Give the wait context: which round just finished, and what's next. The next
  // round number is "completed + 1"; its theme comes from the organizer agenda.
  const done = state.rounds_completed;
  const total = state.target_rounds ?? null;
  const isFinal = total != null && done >= total;
  const nextNumber = done + 1;
  const nextTheme = agendaFor(nextNumber - 1, state.round_topics);

  // The table you just left — so you can still ❤️/note the people you met before
  // the next round pulls them off screen. Only when we have an event id (needed
  // for the like/note calls) and you actually had tablemates.
  const justMet = state.recent_seat?.tablemates ?? [];
  const showJustMet = Boolean(eventId) && justMet.length > 0;

  // Same brand treatment as the waiting room and the "next round is yours" screen:
  // logo → hourglass → message → the sponsor flip. The hourglass IS the waiting
  // indicator, so it's always present (not only when sponsors exist) — the gap
  // between rounds looks identical to every other wait, sponsors or not.
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center pt-2 text-center">
        <EventLogo branding={branding} className="mb-4" />
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border">
          Round {done}{total ? ` of ${total}` : ""} complete
        </span>
        <WaitingStage sponsors={sponsors} hourglassSize={104} />
        <h1 className="mt-3 font-display text-2xl text-foreground">
          {isFinal ? "That was the last round" : "Round complete"}
        </h1>
        {isFinal ? (
          <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
            Nice one — that wraps the rounds. Hang tight while the host closes things out.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
              Nice one. The next table is being set up — hang tight, you&apos;ll be moved in a few seconds.
            </p>
            <div className="mt-4 w-full max-w-[300px] rounded-2xl border border-border bg-card/60 p-4 text-left">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next up</div>
              <div className="mt-1 flex items-center gap-2.5">
                <span
                  className="inline-flex shrink-0 items-center justify-center rounded-xl px-2.5 py-1 font-display text-lg leading-none"
                  style={{ background: nextTheme.bg, color: nextTheme.ink }}
                >
                  R{nextNumber}
                </span>
                <span className="truncate font-display text-lg text-foreground">{nextTheme.name}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {showJustMet && (
        <section>
          <div className="mb-2.5 flex items-center gap-2">
            <Heart className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">
              People you just met{state.recent_round_number ? ` · Round ${state.recent_round_number}` : ""}
            </h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Tap the heart to remember someone, or jot a private note — before the next round starts.
          </p>
          <ul className="space-y-2.5">
            {justMet.map((m) => (
              <TablemateRow
                key={m.attendee_id}
                mate={m}
                eventId={eventId!}
                notesOpen={openNoteAttendeeId === m.attendee_id}
                onToggleNotes={() =>
                  setOpenNoteAttendeeId((current) => (current === m.attendee_id ? null : m.attendee_id))
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Shown when a round is live but this attendee has no table for it. Two ways to
 * land here:
 *  - a LATE ARRIVAL who checked in mid-round (seating froze before they were in
 *    the room) — they'll be placed when the organizer starts the next round; or
 *  - a GUEST (speaker/host) who is deliberately never in the table rotation.
 * The screen must tell these two apart so we never promise a seat to a guest who
 * will never get one. For the late arrival, the dead wait becomes useful: a clear
 * "you're next", who's in the room, the directory to browse now, and sponsors.
 */
export function NotSeated({ state, eventId }: { state: LiveState; eventId?: string }) {
  const firstName = (state.attendee_name ?? "").trim().split(/\s+/)[0] || "there";
  const isGuest = state.attendee_tag === "speaker" || state.attendee_tag === "host";
  const branding = useEventBranding(eventId);
  const sponsors = branding?.sponsors ?? [];
  const roster = state.roster ?? { count: 0, preview: [] };

  // Name the round everyone else is in right now, so the wait has context.
  const currentRoundNumber = state.round?.round_number ?? null;
  const currentTopic = currentRoundNumber
    ? agendaFor(currentRoundNumber - 1, state.round_topics).name
    : null;

  // --- Guest (speaker / host): not in the rotation, so never promise a seat. ---
  if (isGuest) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-medium text-gold ring-1 ring-inset ring-gold/25">
            <Star className="h-3 w-3" aria-hidden />
            You&apos;re a {state.attendee_tag}
          </span>
          <span className="truncate text-xs text-muted-foreground">Hi, {firstName}</span>
        </div>
        <StatusPanel
          icon={<Star className="h-7 w-7" />}
          title="You're here as a guest"
          subtitle={`As a ${state.attendee_tag} you're not in the table rotation, so you won't be shuffled between tables — the floor is yours. Mingle freely and enjoy the event.`}
        >
          <EventLogo branding={branding} className="mt-2 max-h-10" />
        </StatusPanel>
        {eventId && <DirectoryLink eventId={eventId} />}
        <SponsorBlock sponsors={sponsors} />
      </div>
    );
  }

  // --- Late arrival: checked in mid-round, will be seated next round. ---
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-inset ring-success/25 shadow-[0_0_16px_-4px_hsl(var(--success)/0.55)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
          You&apos;re checked in
        </span>
        <span className="truncate text-xs text-muted-foreground">Hi, {firstName}</span>
      </div>

      <div className="flex flex-col items-center pt-2 text-center">
        <EventLogo branding={branding} className="mb-4" />
        <WaitingStage sponsors={sponsors} hourglassSize={104} />
        <h1 className="mt-3 font-display text-2xl text-foreground">Next round is yours</h1>
        <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
          {currentTopic ? (
            <>&ldquo;{currentTopic}&rdquo; is underway right now. The moment it wraps, we&apos;ll seat you for the next one. </>
          ) : (
            <>A round&apos;s in progress right now. The moment it wraps, we&apos;ll seat you for the next one. </>
          )}
          Keep this screen open.
        </p>
      </div>

      {/* Reassurance that they aren't forgotten — the host's console lists them. */}
      <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <UserCheck className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">You&apos;re on the floor list.</span> The host can see you&apos;re here and will place you in the next round.
        </p>
      </div>

      <RoomRoster roster={roster} />
      {eventId && <DirectoryLink eventId={eventId} />}
    </div>
  );
}

export function EventEnded() {
  return (
    <StatusPanel
      icon={<CalendarX2 className="h-7 w-7" />}
      title="Event has ended"
      subtitle="This event is over. You can return home to see your upcoming and past events."
    >
      <Link href="/home" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-1")}>
        Back to home
      </Link>
    </StatusPanel>
  );
}

/** Round-start REVEAL — the celebratory "your table is N" moment in the round's
 * signature color, before settling into the table. Reuses the landing "reveal"
 * scene's visual language. Shown ONCE per round (sessionStorage-gated in
 * RoundView, so a mid-round refresh doesn't replay it), tap-to-skip, and skipped
 * entirely under prefers-reduced-motion. */
function RoundReveal({
  round,
  roundNumber,
  tableNumber,
  mateCount,
  onDone,
}: {
  round: Round;
  roundNumber: number;
  tableNumber: number;
  mateCount: number;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reduced) {
      onDone(); // honor reduced-motion: go straight to the table, no animation
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 650);
    const t2 = setTimeout(onDone, 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduced, onDone]);

  if (reduced) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: phase >= 1 ? round.bg : COLORS.ink900, transition: "background 0.7s ease" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="status"
      aria-label={`Round ${roundNumber} starting — your table is ${tableNumber}`}
      onClick={onDone}
    >
      {phase >= 1 &&
        Array.from({ length: 16 }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ left: "50vw", top: "55vh", opacity: 0, scale: 0 }}
            animate={{
              left: `calc(50vw + ${Math.cos((i / 16) * Math.PI * 2) * 42}vw)`,
              top: `calc(55vh + ${Math.sin((i / 16) * Math.PI * 2) * 42}vh)`,
              opacity: [0, 1, 0],
              scale: [0, 1, 0.3],
            }}
            transition={{ duration: 1.6, delay: 0.1 + i * 0.03 }}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: round.ink, opacity: 0.5 }}
            aria-hidden
          />
        ))}

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center" style={{ color: round.ink }}>
        <AnimatePresence mode="wait">
          {phase === 0 ? (
            <motion.div key="p0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center text-cream">
              <div className="mb-5 h-12 w-12 animate-spin rounded-full border-2 border-cream/25 border-t-cream" />
              <p className="font-display text-xl">Reading the room…</p>
              <p className="mt-2 text-xs text-cream/50">Finding your people for this round</p>
            </motion.div>
          ) : (
            <motion.div key="p1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="mb-2 text-[10px] uppercase tracking-[0.4em] opacity-80">
                Round {roundNumber} · {round.name}
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-1 text-xs opacity-70">
                Your table is
              </motion.div>
              <motion.div
                initial={{ scale: 0.4, opacity: 0, filter: "blur(15px)" }}
                animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 220, damping: 19 }}
                className="font-display leading-[0.8] tracking-[-0.05em]"
                style={{ fontSize: "clamp(7rem, 40vw, 12rem)" }}
              >
                {tableNumber}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium"
                style={{ background: round.ink, color: round.bg }}
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                {mateCount > 0 ? `${mateCount} ${mateCount === 1 ? "human" : "humans"} waiting` : "Settle in"}
              </motion.div>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="mt-8 text-[11px] opacity-60">
                Tap to continue
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** The main event: your table, tablemates, and a personalized icebreaker. */
export function RoundView({
  state,
  eventId,
  onExpire,
  refreshVersion = 0,
}: {
  state: LiveState;
  eventId: string;
  onExpire: () => void;
  refreshVersion?: number;
}) {
  const round = state.round!;
  const seat = state.seat!;
  const remaining = useCountdown(round.ends_at, state.server_time, onExpire, round.paused_at);
  // The boarding pass carries the round's THEME (organizer agenda, else the
  // canonical name); the heading above stays the plain "Round N".
  const themed = agendaFor(round.round_number - 1, state.round_topics);
  const mates = seat.tablemates;
  const paused = Boolean(round.paused_at);
  // Published but the host hasn't started the clock yet: the table is visible so
  // people can go find their seat, but there's no countdown until "Start round".
  const notStarted = !round.started_at;
  const wantedHere = mates.filter((m) => m.wanted);
  const [openNoteAttendeeId, setOpenNoteAttendeeId] = useState<string | null>(null);

  // Play the round-start reveal once per round. sessionStorage-gated by round_id
  // so a mid-round refresh/poll never replays it (it would be jarring), but a
  // genuinely new round (or getting seated after sitting one out) does.
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionStorage.getItem(`peopld:revealed:${round.round_id}`)) setRevealing(true);
  }, [round.round_id]);
  const finishReveal = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.setItem(`peopld:revealed:${round.round_id}`, "1");
    setRevealing(false);
  }, [round.round_id]);

  useEffect(() => {
    setOpenNoteAttendeeId(null);
  }, [round.round_id]);

  useEffect(() => {
    setOpenNoteAttendeeId(null);
  }, [refreshVersion]);

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {revealing && (
          <RoundReveal
            round={themed}
            roundNumber={round.round_number}
            tableNumber={seat.table_number}
            mateCount={mates.length}
            onDone={finishReveal}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-foreground">Round {round.round_number}</h1>
        {notStarted ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-sm font-medium text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
            Starting soon
          </span>
        ) : (
          <CountdownPill remaining={remaining} paused={paused} />
        )}
      </div>

      <BoardingPass
        round={themed}
        tableNumber={String(seat.table_number)}
        seat=""
        location=""
        showIcebreaker={false}
      />

      {notStarted && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-accent/30 bg-accent/[0.06] p-3.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-foreground">
            Head to <span className="font-semibold">table {seat.table_number}</span> — the round
            begins the moment the host starts it. Grab your seat and say hi while you wait.
          </p>
        </div>
      )}

      {wantedHere.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-accent/40 bg-accent/10 p-3.5">
          <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-foreground">
            {wantedHere.length === 1 ? (
              <>
                <span className="font-semibold text-accent">{wantedHere[0].name}</span> is at your
                table — someone you wanted to meet. Make it count.
              </>
            ) : (
              <>
                <span className="font-semibold text-accent">
                  {wantedHere.length} people you wanted to meet
                </span>{" "}
                are at your table: {wantedHere.map((m) => m.name).join(", ")}.
              </>
            )}
          </p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-foreground">
          Your table{mates.length > 0 ? ` · ${mates.length + 1} people` : ""}
        </h2>
        {mates.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ve got this table to yourself for a moment — others will join shortly.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {mates.map((m) => (
              <TablemateRow
                key={m.attendee_id}
                mate={m}
                eventId={eventId}
                notesOpen={openNoteAttendeeId === m.attendee_id}
                onToggleNotes={() =>
                  setOpenNoteAttendeeId((current) => (current === m.attendee_id ? null : m.attendee_id))
                }
              />
            ))}
          </ul>
        )}
      </section>

      {state.icebreaker ? (
        <IcebreakerCard text={state.icebreaker.question_text} />
      ) : (
        <div className="rounded-[24px] border border-dashed border-border bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="h-3 w-3" /> AI Icebreaker
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Crafting a question to break the ice…
          </div>
        </div>
      )}
    </div>
  );
}
