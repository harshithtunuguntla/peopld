"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { LiveState } from "@/lib/live/use-live-state";

/**
 * App-wide live notifier (Tier 1). Mounted on the per-event layout so an attendee
 * on ANY in-event page (profile, directory, rolodex, recap…) is told when the
 * organizer moves the room — the gap from the last pilot, where someone browsing
 * elsewhere never learned a round had started.
 *
 * Mirrors `useLiveState`'s contract — realtime is a doorbell, REST is the source
 * of truth — but it only watches for *transitions* and turns them into a toast:
 *   - de-dupes the backend's intentional 3x re-broadcast via a state signature;
 *   - records a silent baseline on first load, so opening the app mid-round never
 *     false-fires;
 *   - persists the last-seen signature per tab so navigating between pages doesn't
 *     reset the baseline (or replay a change you already saw);
 *   - reconciles on tab re-focus / network regain, firing once if the room moved
 *     while you were away.
 * On the /live page itself the toast is suppressed (that page already shows the
 * change) — but the baseline keeps advancing so leaving /live never replays.
 */
export interface LiveNotice {
  id: number;
  kind: "round_started" | "round_ended" | "event_ended" | "ending_soon" | "announcement" | "match";
  title: string;
  body: string;
  cta: { label: string; href: string } | null;
  sticky: boolean; // round-start/announcement stay until tapped/closed; others auto-dismiss
}

const DEBOUNCE_MS = 300;
const POLL_MS = 20_000; // light backstop behind the doorbell (only when not suppressed)
const ENDING_SOON_LEAD_MS = 30_000; // nudge ~30s before a round's timer runs out
const seenKey = (eventId: string) => `notify:seen:${eventId}`;
const annKey = (eventId: string) => `notify:ann:${eventId}`;
const matchKey = (eventId: string) => `notify:matches:${eventId}`;

/** A compact fingerprint of "where the room is" — changes exactly on a real
 *  transition (publish/begin/end/advance/event-end), so comparing it de-dupes
 *  the repeated broadcasts down to one notice per move. */
function signatureOf(s: LiveState): string {
  const n = s.round?.round_number ?? s.recent_round_number ?? 0;
  return `${s.event_status}|${s.phase}|${n}`;
}

function readSeen(eventId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(seenKey(eventId));
  } catch {
    return null;
  }
}
function writeSeen(eventId: string, sig: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(seenKey(eventId), sig);
  } catch {
    /* best-effort */
  }
}

function readAnnSeen(eventId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(annKey(eventId));
  } catch {
    return null;
  }
}
function writeAnnSeen(eventId: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(annKey(eventId), id);
  } catch {
    /* best-effort */
  }
}

/** Returns the stored matched-ids array, or null if we've never recorded a
 *  baseline for this event/tab (so we can stay silent on the very first load). */
function readMatchSeen(eventId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(matchKey(eventId));
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function writeMatchSeen(eventId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(matchKey(eventId), JSON.stringify(ids));
  } catch {
    /* best-effort */
  }
}

/** Decide the toast for a transition into `next` (null = nothing worth saying). */
function noticeFor(eventId: string, next: LiveState, idSeed: number): LiveNotice | null {
  const liveHref = `/event/${eventId}/live`;
  const recapHref = `/event/${eventId}/recap`;
  const isAttendee = next.attendee_tag === "attendee";

  if (next.event_status === "ended" || next.phase === "ended") {
    return {
      id: idSeed,
      kind: "event_ended",
      title: "That's a wrap! 🎉",
      body: "The event has ended — see everyone you met.",
      cta: { label: "See who you met", href: recapHref },
      sticky: true,
    };
  }
  if (next.phase === "in_round") {
    const n = next.round?.round_number ?? 0;
    const table = next.seated ? next.seat?.table_number ?? null : null;
    return {
      id: idSeed,
      kind: "round_started",
      title: n ? `Round ${n} is starting` : "A new round is starting",
      body:
        table != null
          ? `You're at Table ${table} — head over.`
          : isAttendee
            ? "Find your table to join in."
            : "The room is in session.",
      cta: { label: "Go to my table", href: liveHref },
      sticky: true,
    };
  }
  if (next.phase === "between_rounds") {
    const n = next.recent_round_number ?? 0;
    return {
      id: idSeed,
      kind: "round_ended",
      title: n ? `Round ${n} wrapped` : "Round wrapped",
      body: "Back in the lobby — the next round is coming up.",
      cta: { label: "Open live", href: liveHref },
      sticky: false,
    };
  }
  return null; // not_started / unknown — nothing to announce
}

export function useLiveNotifications(eventId: string, suppress: boolean) {
  const [notices, setNotices] = useState<LiveNotice[]>([]);
  // `dormant` = confirmed not a participant of this event (e.g. on the register
  // page before joining). We stop the backstop poll so we never hammer a
  // known-failing /live; the realtime doorbell still wakes us if they join.
  const [dormant, setDormant] = useState(false);
  const dormantRef = useRef(false);
  const seenRef = useRef<string | null>(readSeen(eventId));
  const annSeenRef = useRef<string | null>(readAnnSeen(eventId)); // last announcement id shown
  const storedMatches = readMatchSeen(eventId);
  const matchSeenRef = useRef<Set<string>>(new Set(storedMatches ?? [])); // matched ids already toasted
  const matchBaselineRef = useRef<boolean>(storedMatches !== null); // false until first load recorded
  const suppressRef = useRef(suppress);
  const idRef = useRef(1);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // "ending soon" nudge
  const nudgedRounds = useRef<Set<string>>(new Set()); // round_ids already nudged

  suppressRef.current = suppress; // always read the latest in async callbacks

  const dismiss = useCallback((id: number) => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);

  const refetch = useCallback(() => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    inFlight.current = true;
    apiFetch<LiveState>(`/events/${eventId}/live`)
      .then((next) => {
        if (dormantRef.current) {
          dormantRef.current = false; // they're a participant now — resume backstop
          setDormant(false);
        }

        // Add a notice (replace any same-kind so toasts never stack) + best-effort
        // buzz. `vibrate` may be a single duration or a pattern (e.g. a double-buzz
        // for announcements). Android only — iOS Safari has no navigator.vibrate.
        const push = (notice: LiveNotice, vibrate?: number | number[]) => {
          if (vibrate) {
            try {
              navigator.vibrate?.(vibrate);
            } catch {
              /* unsupported (iOS) */
            }
          }
          setNotices((list) => [...list.filter((n) => n.kind !== notice.kind), notice]);
        };

        // 1) Round / phase transitions — de-duped by signature; silent baseline on
        //    first load; suppressed on /live + /recap (baseline still advances).
        const sig = signatureOf(next);
        const prev = seenRef.current;
        if (prev === null) {
          seenRef.current = sig;
          writeSeen(eventId, sig);
        } else if (sig !== prev) {
          seenRef.current = sig;
          writeSeen(eventId, sig);
          if (!suppressRef.current) {
            const notice = noticeFor(eventId, next, idRef.current++);
            if (notice) push(notice, notice.kind === "round_started" ? 180 : undefined);
          }
        }

        // 2) Organizer announcement — deduped by id, silent baseline. Shown on
        //    EVERY page (even /live/recap): an announcement isn't a round move.
        const ann = next.latest_announcement;
        if (ann) {
          const seenAnn = annSeenRef.current;
          if (seenAnn === null) {
            annSeenRef.current = ann.id;
            writeAnnSeen(eventId, ann.id);
          } else if (ann.id !== seenAnn) {
            annSeenRef.current = ann.id;
            writeAnnSeen(eventId, ann.id);
            push(
              { id: idRef.current++, kind: "announcement", title: ann.message, body: "From the host", cta: null, sticky: true },
              [40, 30, 70], // distinct double-buzz so a broadcast feels different
            );
          }
        }

        // 3) Mutual matches — toast NEW ones (shown everywhere; a match is a moment).
        //    Silent baseline on first load so existing matches don't replay.
        if (!matchBaselineRef.current) {
          next.matches.forEach((m) => matchSeenRef.current.add(m.attendee_id));
          writeMatchSeen(eventId, [...matchSeenRef.current]);
          matchBaselineRef.current = true;
        } else {
          const fresh = next.matches.filter((m) => !matchSeenRef.current.has(m.attendee_id));
          if (fresh.length) {
            fresh.forEach((m) => matchSeenRef.current.add(m.attendee_id));
            writeMatchSeen(eventId, [...matchSeenRef.current]);
            const body =
              fresh.length === 1
                ? `You and ${fresh[0].name} liked each other.`
                : `You matched with ${fresh[0].name} +${fresh.length - 1} more.`;
            push(
              { id: idRef.current++, kind: "match", title: "It's a match! 🎉", body, cta: { label: "See your matches", href: `/event/${eventId}/connections` }, sticky: true },
              [30, 40, 30, 40, 80], // celebratory triple-buzz
            );
          }
        }

        // 4) "Round ending soon" nudge — schedule a one-shot ~30s before the timer
        //    runs out. Re-derived from the freshest snapshot each fetch.
        if (endTimer.current) {
          clearTimeout(endTimer.current);
          endTimer.current = null;
        }
        const r = next.round;
        if (!suppressRef.current && next.phase === "in_round" && next.seated && r?.ends_at && !r.paused_at) {
          const roundId = r.round_id;
          const endMs = Date.parse(r.ends_at);
          if (!nudgedRounds.current.has(roundId) && !Number.isNaN(endMs)) {
            const fire = () => {
              if (suppressRef.current || nudgedRounds.current.has(roundId)) return;
              nudgedRounds.current.add(roundId);
              push(
                { id: idRef.current++, kind: "ending_soon", title: "About 30 seconds left", body: "This round is wrapping up — say your goodbyes.", cta: null, sticky: false },
                80,
              );
            };
            const msLeft = endMs - Date.now();
            if (msLeft > ENDING_SOON_LEAD_MS) {
              endTimer.current = setTimeout(fire, msLeft - ENDING_SOON_LEAD_MS);
            } else if (msLeft > 5_000) {
              fire(); // already inside the lead window, still worth saying
            }
            // <5s left → too late to be useful, skip
          }
        }
      })
      .catch((e: unknown) => {
        // Not a participant (or signed out) → go dormant so the interval poll
        // stops; the doorbell can still revive us if they join. Other errors
        // (transient/offline) stay silent and the backstop keeps trying.
        const status = e instanceof ApiError ? e.status : 0;
        const msg = e instanceof Error ? e.message : "";
        if (status === 401 || status === 403 || /not registered/i.test(msg)) {
          dormantRef.current = true;
          setDormant(true);
        }
      })
      .finally(() => {
        inFlight.current = false;
        if (pending.current) {
          pending.current = false;
          refetch();
        }
      });
  }, [eventId]);

  const ping = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(refetch, DEBOUNCE_MS);
  }, [refetch]);

  // Doorbell + reconcile-on-return, mirroring useLiveState (separate channel name
  // so it never collides with the live page's own subscription).
  useEffect(() => {
    refetch();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notify:${eventId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rounds", filter: `event_id=eq.${eventId}` },
          ping,
        )
        .on("broadcast", { event: "resync" }, ping)
        .subscribe();
    } catch {
      /* realtime blocked → the poll below keeps us fresh */
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (endTimer.current) clearTimeout(endTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [eventId, refetch, ping]);

  // Cancel a pending "ending soon" nudge the moment we're suppressed (navigated
  // onto /live or /recap), so it can't fire on a screen that shouldn't get it.
  useEffect(() => {
    if (suppress && endTimer.current) {
      clearTimeout(endTimer.current);
      endTimer.current = null;
    }
  }, [suppress]);

  // Light backstop poll — covers a dropped doorbell. Off when suppressed (on
  // /live the page already polls) and when dormant (not a participant — don't
  // hammer a /live that will only 404 "not registered").
  useEffect(() => {
    if (suppress || dormant) return;
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [suppress, dormant, refetch]);

  return { notices, dismiss };
}
