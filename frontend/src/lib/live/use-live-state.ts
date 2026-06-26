"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// Mirror of the backend LiveStateResponse (backend/app/models/schemas.py).
export interface LiveRound {
  round_id: string;
  round_number: number;
  status: "active" | "completed";
  started_at: string | null;
  duration_seconds: number;
  ends_at: string | null;
  paused_at: string | null;
}
export interface Tablemate {
  attendee_id: string;
  name: string;
  role: string;
  company: string | null;
  looking_for: string | null;
  interests: string[];
  shared_interests: string[];
  avatar_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  liked: boolean;
  wanted: boolean; // I picked this person pre-event (Phase 3a) → at-table nudge
  note: string | null; // my own private note about this person (pre-fills the at-table note editor)
}
export interface LiveSeat {
  table_number: number;
  tablemates: Tablemate[];
}
export interface LiveIcebreaker {
  question_text: string;
  target_attendee_id: string;
}
export interface RosterPerson {
  attendee_id: string;
  name: string;
  avatar_url: string | null;
}
export interface WaitingRoster {
  count: number;
  preview: RosterPerson[];
}
export interface LiveState {
  server_time: string;
  event_status: "upcoming" | "active" | "ended";
  phase: "not_started" | "in_round" | "between_rounds" | "ended";
  event_name: string;
  attendee_id: string;
  attendee_name: string;
  attendee_status: "registered" | "arrived" | "left";
  attendee_tag: "attendee" | "speaker" | "host";
  target_rounds: number | null;
  round_seconds: number;
  round_topics: string[];
  rounds_completed: number;
  seated: boolean;
  roster: WaitingRoster;
  round: LiveRound | null;
  seat: LiveSeat | null;
  icebreaker: LiveIcebreaker | null;
  recent_seat: LiveSeat | null; // between rounds: the table you just left, so you can still like/note
  recent_round_number: number | null;
}

export interface UseLiveState {
  state: LiveState | null;
  loading: boolean; // only the very first fetch — refetches are silent
  error: string | null;
  /** true when the snapshot says "you're not registered for this event" (→ send to register). */
  notRegistered: boolean;
  refetch: () => void;
}

// Polling is a thin per-phase BACKSTOP, not the main delivery mechanism. The
// primary fix for the live-pilot "a publish didn't reach some phones" is on the
// backend: every change is broadcast several times on a spaced schedule
// (app/realtime.py), so a single dropped message almost always self-corrects via
// a repeat — no polling needed. Polling here only covers the residual case where
// even the repeats miss a phone, and it's targeted so we don't tax phones that
// can't be stale:
//   - socket DOWN                         → fast catch-up (this client only)
//   - WAITING for a change (lobby / between rounds / late-arrival / published-but-
//     not-started) → tighter backstop: these are the ONLY phones a dropped
//     publish/begin can strand.
//   - mid a RUNNING round                 → light: the snapshot already has the
//     table + icebreaker, and the countdown ticks LOCALLY off an absolute end
//     time, so there's almost nothing to re-pull (this just backstops a missed
//     pause/resume/extend; a missed end self-heals when the local timer hits 0).
//   - event ENDED                         → lazy.
const RECOVERY_MS = 5_000; // realtime socket down → fast catch-up
const WAITING_MS = 12_000; // socket up, waiting for the next change
const RUNNING_MS = 30_000; // socket up, mid running round (countdown is local)
const ENDED_MS = 45_000; // event over → lazy
// On publish, table_assignments fires one INSERT per attendee (40 people → 40
// pings). Coalesce that burst into ONE /live fetch instead of dozens.
const DEBOUNCE_MS = 250;

/** The backstop poll cadence for the current connection health + event phase.
 *  See the constants above for the reasoning behind each tier. */
function pollIntervalFor(state: LiveState | null, realtimeUp: boolean): number {
  if (!realtimeUp) return RECOVERY_MS; // socket down → fast catch-up regardless of phase
  if (!state) return WAITING_MS; // loading into the live page → treat as waiting
  if (state.phase === "ended" || state.event_status === "ended") return ENDED_MS;
  // Mid a RUNNING round (seated AND the clock has started): everything's local.
  if (state.phase === "in_round" && state.seated && state.round?.started_at) return RUNNING_MS;
  // Lobby / between rounds / late-arrival not-yet-seated / published-but-not-started
  // — the phones a dropped publish/begin would strand. Keep a tighter backstop.
  return WAITING_MS;
}

const cacheKey = (eventId: string) => `live:${eventId}`;

/** Last-known snapshot for instant paint on reload/wake (stale-while-revalidate).
 * The table number doesn't change within a round, so showing the cached value
 * immediately — then revalidating in the background — removes the spinner. */
function readCache(eventId: string): LiveState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(eventId));
    return raw ? (JSON.parse(raw) as LiveState) : null;
  } catch {
    return null;
  }
}

function writeCache(eventId: string, state: LiveState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(cacheKey(eventId), JSON.stringify(state));
  } catch {
    /* storage full / disabled — caching is best-effort */
  }
}

/**
 * The attendee Live Dashboard data source. Implements the Step-5 contract:
 * **Realtime is a doorbell, REST is the source of truth** (PRODUCT.md / REQ-RT-01).
 *
 * - Paints instantly from a cached snapshot, then revalidates in the background.
 * - Re-fetches (never parses payloads) on every realtime ping (debounced), on a
 *   polling fallback, on tab wake (visibilitychange), and on network regain.
 * - The attendee is resolved server-side from the JWT — no id in the URL.
 */
export function useLiveState(eventId: string): UseLiveState {
  const cached = useRef<LiveState | null>(readCache(eventId)).current;
  const [state, setState] = useState<LiveState | null>(cached);
  const [loading, setLoading] = useState(cached === null); // cache hit = no spinner
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [realtimeUp, setRealtimeUp] = useState(false); // false → poll fast until the doorbell confirms it's live
  const hasSubscribedRef = useRef(false); // tells a first subscribe apart from a RE-subscribe (→ catch-up fetch)
  const inFlight = useRef(false);
  const pending = useRef(false); // a ping arrived mid-fetch → fetch once more after
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(() => {
    // Collapse overlapping pings: if a fetch is running, mark that another is
    // needed and let the in-flight one re-trigger when it lands.
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    inFlight.current = true;
    apiFetch<LiveState>(`/events/${eventId}/live`)
      .then((next) => {
        setState(next);
        writeCache(eventId, next);
        setError(null);
        setNotRegistered(false);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Couldn't reach the event";
        if (/not registered/i.test(msg)) setNotRegistered(true);
        else setError(msg);
      })
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
        if (pending.current) {
          pending.current = false;
          refetch(); // serve the change that arrived while we were fetching
        }
      });
  }, [eventId]);

  // Debounced trigger for realtime pings (a publish storm = one fetch).
  const ping = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(refetch, DEBOUNCE_MS);
  }, [refetch]);

  // Realtime doorbell + connection-health tracking. TWO independent doorbells for
  // resilience on the critical round-state path:
  //   1. `rounds` postgres_changes — ONE row per state change (publish/begin/pause/
  //      resume/extend/end/cancel), so ~40 messages, never a burst. Native + reliable.
  //   2. a server-sent Broadcast ("resync") the backend rings on every change AND
  //      the organizer's "Re-sync room" button — covers icebreaker reveal and adds
  //      redundancy for round state.
  // We deliberately DROPPED the `table_assignments` and `icebreakers`
  // postgres_changes: those fanned out one message PER ROW per subscriber
  // (a publish = 40 rows × 40 phones ≈ 1,640 messages) and overran Realtime's
  // throughput, silently dropping events — the actual cause of missed publishes.
  // The subscribe status callback drives the adaptive poll below and fires a
  // catch-up fetch whenever the socket RE-connects (events aren't replayed).
  useEffect(() => {
    refetch(); // immediate authoritative fetch on mount (revalidate the cache)

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`live:${eventId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `event_id=eq.${eventId}` }, ping)
        .on("broadcast", { event: "resync" }, ping)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setRealtimeUp(true);
            // Only a RE-subscribe needs a catch-up — the mount fetch already
            // covers the very first connect, so we don't double-fetch on load.
            if (hasSubscribedRef.current) refetch();
            hasSubscribedRef.current = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeUp(false); // doorbell down → fast recovery poll takes over
          }
        });
    } catch {
      // Realtime unavailable (blocked/misconfigured) — realtimeUp stays false, so
      // the recovery-cadence poll below keeps this client fresh on its own.
      setRealtimeUp(false);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
      hasSubscribedRef.current = false; // next mount / event starts fresh
    };
  }, [eventId, refetch, ping]);

  // Backstop poll — a thin safety net behind the backend's repeated broadcasts.
  // Cadence is per phase + connection health (see pollIntervalFor); re-arms
  // whenever the tier changes.
  const pollMs = pollIntervalFor(state, realtimeUp);
  useEffect(() => {
    const id = setInterval(refetch, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refetch]);

  return { state, loading, error, notRegistered, refetch };
}
