"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// Mirror of the backend SponsorsResponse (backend/app/routers/sponsors.py).
export interface Sponsor {
  id: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
  url: string | null;
}
export interface EventBranding {
  event_name: string;
  logo_url: string | null;
  show_event_logo: boolean;
  sponsors: Sponsor[];
}

// Sponsors/logo change rarely, so cache per event for the session and share one
// in-flight request across the screens that show branding (waiting room +
// between rounds + a logo). Avoids re-fetching on every phase transition.
const cache = new Map<string, EventBranding>();
const inflight = new Map<string, Promise<EventBranding>>();

const EMPTY: EventBranding = { event_name: "", logo_url: null, show_event_logo: false, sponsors: [] };

function load(eventId: string): Promise<EventBranding> {
  const existing = inflight.get(eventId);
  if (existing) return existing;
  const p = apiFetch<EventBranding>(`/events/${eventId}/sponsors`)
    .then((b) => {
      cache.set(eventId, b);
      inflight.delete(eventId);
      return b;
    })
    .catch(() => {
      inflight.delete(eventId);
      return EMPTY; // branding is non-critical — never block the screen on it
    });
  inflight.set(eventId, p);
  return p;
}

/** Read the event's sponsors + logo + show-logo toggle. Returns null until loaded. */
export function useEventBranding(eventId: string | undefined): EventBranding | null {
  const [branding, setBranding] = useState<EventBranding | null>(
    () => (eventId ? cache.get(eventId) ?? null : null),
  );

  useEffect(() => {
    if (!eventId) return;
    const cached = cache.get(eventId);
    if (cached) {
      setBranding(cached);
      return;
    }
    let active = true;
    load(eventId).then((b) => {
      if (active) setBranding(b);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  return branding;
}
