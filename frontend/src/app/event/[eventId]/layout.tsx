"use client";

import { use, type ReactNode } from "react";
import { LiveNotifier } from "@/components/live/live-notifier";

/**
 * Per-event boundary: renders the page plus the app-wide LiveNotifier, so an
 * attendee on ANY screen for this event (profile, directory, rolodex, recap…)
 * is alerted when the organizer starts/ends a round or ends the event. The
 * notifier suppresses itself on /live (that page shows the change directly).
 */
export default function EventByIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  return (
    <>
      {children}
      <LiveNotifier eventId={eventId} />
    </>
  );
}
