"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { EventHeader, EventAccessError } from "@/components/organizer/event-header";
import { type EventInfo } from "@/components/organizer/live/types";

// The intelligence experience is heavy (recharts + the relationship graph), so it
// only loads on this dedicated page — never on the live command center.
const EventRecap = dynamic(() => import("@/components/organizer/live/recap").then((m) => m.EventRecap), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-2xl border border-border" />,
});

/**
 * Post-event intelligence. Deliberately separated from /live so the live command
 * center stays light: all the relationship analytics, the network graph, and the
 * event-memory insights live here. Owner-only, same gating as the rest of the
 * console.
 */
export default function OrganizerAnalyticsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [denied, setDenied] = useState<null | "forbidden" | "missing">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch<EventInfo>(`/events/${eventId}`)
      .then(setEvent)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setDenied("forbidden");
        else if (e instanceof ApiError && e.status === 404) setDenied("missing");
        else setError(e instanceof Error ? e.message : "Couldn't load analytics");
      });
  }, [user, eventId]);

  if (denied) {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} active="analytics" />
        <EventAccessError notFound={denied === "missing"} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell>
      <EventHeader eventId={eventId} name={event?.name} status={event?.status} active="analytics" />

      {error && (
        <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Wait for the event so the recap renders the correct phase from the first
          paint (live "in progress" vs the post-event "wrap"), no flicker between. */}
      {(!checked || !user || !event) ? (
        <div className="h-40 skeleton rounded-2xl border border-border" />
      ) : (
        <EventRecap eventId={eventId} live={event.status !== "ended"} />
      )}
    </ConsoleShell>
  );
}
