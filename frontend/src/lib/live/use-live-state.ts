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

const POLL_MS = 12_000; // fallback for when websockets are blocked entirely

/**
 * The attendee Live Dashboard data source. Implements the Step-5 contract:
 * **Realtime is a doorbell, REST is the source of truth** (PRODUCT.md / REQ-RT-01).
 *
 * - Fetches one authoritative snapshot (`GET /events/:id/live`) on mount.
 * - Re-fetches (never parses payloads) on every realtime ping, on a polling
 *   fallback, on tab wake (visibilitychange), and on network regain (online).
 * - The attendee is resolved server-side from the JWT — no id in the URL.
 */
export function useLiveState(eventId: string): UseLiveState {
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const inFlight = useRef(false);

  const refetch = useCallback(() => {
    if (inFlight.current) return; // collapse overlapping pings into one request
    inFlight.current = true;
    apiFetch<LiveState>(`/events/${eventId}/live`)
      .then((next) => {
        setState(next);
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
      });
  }, [eventId]);

  useEffect(() => {
    refetch();

    // Realtime doorbell: any change to this event's rounds / seating / icebreakers
    // just triggers a re-fetch of the authoritative snapshot.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`live:${eventId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `event_id=eq.${eventId}` }, () => refetch())
        .on("postgres_changes", { event: "*", schema: "public", table: "table_assignments", filter: `event_id=eq.${eventId}` }, () => refetch())
        // icebreakers carry no event_id column; refetch on any insert (cheap + idempotent).
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "icebreakers" }, () => refetch())
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
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [eventId, refetch]);

  return { state, loading, error, notRegistered, refetch };
}
