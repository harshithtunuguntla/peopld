"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Activity } from "lucide-react";

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

      {/* Mid-event note: the numbers are real but still growing each round. */}
      {event && event.status !== "ended" && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted-foreground">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          This event is still live — these numbers update as each round completes. The full picture lands once you wrap up.
        </p>
      )}

      {(!checked || !user) ? (
        <div className="h-40 skeleton rounded-2xl border border-border" />
      ) : (
        <EventRecap eventId={eventId} />
      )}
    </ConsoleShell>
  );
}
