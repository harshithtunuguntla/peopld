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
  liked: boolean;
  wanted: boolean; // I picked this person pre-event (Phase 3a) → at-table nudge
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
  target_rounds: number | null;
  round_seconds: number;
  round_topics: string[];
  seated: boolean;
  roster: WaitingRoster;
  round: LiveRound | null;
  seat: LiveSeat | null;
  icebreaker: LiveIcebreaker | null;
}

export interface UseLiveState {
  state: LiveState | null;
  loading: boolean; // only the very first fetch — refetches are silent
  error: string | null;
  /** true when the snapshot says "you're not registered for this event" (→ send to register). */
  notRegistered: boolean;
  refetch: () => void;
}

const POLL_MS = 20_000; // fallback for when websockets are blocked entirely
// On publish, table_assignments fires one INSERT per attendee (40 people → 40
// pings). Coalesce that burst into ONE /live fetch instead of dozens.
const DEBOUNCE_MS = 250;

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

  useEffect(() => {
    refetch(); // immediate authoritative fetch on mount (revalidate the cache)

    // Realtime doorbell: any change to this event's rounds / seating / icebreakers
    // triggers a debounced re-fetch of the authoritative snapshot.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`live:${eventId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `event_id=eq.${eventId}` }, ping)
        .on("postgres_changes", { event: "*", schema: "public", table: "table_assignments", filter: `event_id=eq.${eventId}` }, ping)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "icebreakers", filter: `event_id=eq.${eventId}` }, ping)
        .subscribe();
    } catch {
      // Realtime unavailable (blocked/misconfigured) — polling below still covers us.
    }

    const poll = setInterval(refetch, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [eventId, refetch, ping]);

  return { state, loading, error, notRegistered, refetch };
}
