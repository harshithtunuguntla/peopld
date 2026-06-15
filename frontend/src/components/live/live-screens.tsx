"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, PartyPopper, Sparkles, Armchair, Clock3, Heart, UserRound } from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { Wordmark } from "@/components/brand/wordmark";
import { BoardingPass } from "@/components/brand/boarding-pass";
import { Avatar } from "@/components/brand/avatar";
import { IcebreakerCard } from "@/components/brand/icebreaker-card";
import { buttonVariants } from "@/components/ui/button";
import { ROUNDS, roundFor } from "@/lib/design/rounds";
import { cn } from "@/lib/utils";
import { Hourglass } from "./hourglass";
import { apiFetch } from "@/lib/api";
import { CountdownPill, useCountdown } from "./countdown";
import type { LiveState, Tablemate } from "@/lib/live/use-live-state";

/** One tablemate, with a like (❤️) toggle. Likes persist and surface in the
 * rolodex later (mutual = a match). Optimistic with revert on failure. */
function TablemateRow({ mate, eventId }: { mate: Tablemate; eventId: string }) {
  const [liked, setLiked] = useState(mate.liked);
  const [pending, setPending] = useState(false);

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

  return (
    <li className="rounded-2xl border border-border bg-card/50 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={mate.name} seed={mate.attendee_id} src={mate.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{mate.name}</p>
          <p className="truncate text-sm text-muted-foreground">{mate.role}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${mate.name}` : `Like ${mate.name}`}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60",
            liked ? "border-accent/40 bg-accent/15 text-accent" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Heart className={cn("h-4 w-4", liked && "fill-current")} aria-hidden />
        </button>
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
    </li>
  );
}

/** Dark shell shared by every live phase: aurora bg, grid, wordmark top bar.
 * Pass `eventId` to show a profile shortcut in the top bar. */
export function LiveShell({
  children,
  right,
  eventId,
}: {
  children: ReactNode;
  right?: ReactNode;
  eventId?: string;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.4} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col px-5 pb-16 pt-7">
        <div className="flex items-center justify-between">
          <Wordmark size={24} />
          <div className="flex items-center gap-3">
            {right}
            {eventId && (
              <Link
                href={`/event/${eventId}/profile`}
                aria-label="Edit your profile"
                title="Your profile"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <UserRound className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
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

/** The "Tonight" agenda — the planned rounds and their themes. The topics are the
 * canonical round set for now; an organizer-authored agenda is a future hook. */
function AgendaCard({ targetRounds, roundSeconds }: { targetRounds: number | null; roundSeconds: number }) {
  const count = targetRounds && targetRounds > 0 ? targetRounds : ROUNDS.length;
  const minutes = Math.max(1, Math.round(roundSeconds / 60));
  const rounds = Array.from({ length: count }, (_, i) => ({ n: i + 1, ...roundFor(i) }));
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

export function WaitingRoom({ state }: { state: LiveState }) {
  // Defensive: tolerate an older backend that doesn't yet send these fields.
  const firstName = (state.attendee_name ?? "").trim().split(/\s+/)[0] || "there";
  const roster = state.roster ?? { count: 0, preview: [] };
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
        <Hourglass size={120} />
        <h1 className="mt-3 font-display text-2xl text-foreground">The room is filling up</h1>
        <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
          <span className="block">Grab a drink and say hi to someone new.</span>
          <span className="block">We&apos;ll light up this screen the moment your table&apos;s ready.</span>
        </p>
      </div>

      <AgendaCard targetRounds={state.target_rounds ?? null} roundSeconds={state.round_seconds ?? 300} />
      <RoomRoster roster={roster} />
    </div>
  );
}

export function BetweenRounds() {
  return (
    <StatusPanel
      icon={<Clock3 className="h-7 w-7" />}
      title="Round complete"
      subtitle="Nice one. The next table is being set up — hang tight, you'll be moved in a few seconds."
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
    </StatusPanel>
  );
}

export function NotSeated() {
  return (
    <StatusPanel
      icon={<Armchair className="h-7 w-7" />}
      title="Sit tight for this round"
      subtitle="You're not seated this round, but you'll be placed in the next one. Stay close and keep this screen open."
    />
  );
}

export function EventEnded({ eventId }: { eventId: string }) {
  return (
    <StatusPanel
      icon={<PartyPopper className="h-7 w-7" />}
      title="That's a wrap"
      subtitle="Thanks for showing up and saying hi. Your connections — names and how to reach them — are ready."
    >
      <Link href={`/event/${eventId}/connections`} className={cn(buttonVariants({ variant: "accent", size: "lg" }), "glow-ember mt-1")}>
        See who you met
      </Link>
    </StatusPanel>
  );
}

/** The main event: your table, tablemates, and a personalized icebreaker. */
export function RoundView({
  state,
  eventId,
  onExpire,
}: {
  state: LiveState;
  eventId: string;
  onExpire: () => void;
}) {
  const round = state.round!;
  const seat = state.seat!;
  const remaining = useCountdown(round.ends_at, state.server_time, onExpire);
  const themed = { ...roundFor(round.round_number - 1), name: `Round ${round.round_number}` };
  const mates = seat.tablemates;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-foreground">Round {round.round_number}</h1>
        <CountdownPill remaining={remaining} />
      </div>

      <BoardingPass
        round={themed}
        tableNumber={String(seat.table_number)}
        seat=""
        location=""
        showIcebreaker={false}
      />

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
              <TablemateRow key={m.attendee_id} mate={m} eventId={eventId} />
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
