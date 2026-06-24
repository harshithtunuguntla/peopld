"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useLiveState } from "@/lib/live/use-live-state";
import {
  LiveShell,
  WaitingRoom,
  RoomCodeCheckIn,
  BetweenRounds,
  NotSeated,
  EventEnded,
  RoundView,
} from "@/components/live/live-screens";

/**
 * Attendee Live Dashboard. The attendee is resolved from the session (never the
 * URL — PRODUCT.md hard rule); only `:eventId` is in the path. All state comes
 * from the authoritative snapshot via `useLiveState`, which recovers on refresh,
 * reconnect, and wake, so a mid-round reload lands you right back at your table.
 */
export default function LiveDashboardPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // Not signed in → the register page owns the sign-in flow for this event.
  useEffect(() => {
    if (authChecked && !user) router.replace(`/event/${eventId}/register`);
  }, [authChecked, user, eventId, router]);

  if (!authChecked || !user) {
    return (
      <LiveShell>
        <CenteredSpinner label="Loading your event…" />
      </LiveShell>
    );
  }

  return <LiveInner eventId={eventId} />;
}

function LiveInner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { state, loading, error, notRegistered, refetch } = useLiveState(eventId);
  const [manualRefreshVersion, setManualRefreshVersion] = useState(0);

  const refreshLiveState = useCallback(() => {
    setManualRefreshVersion((version) => version + 1);
    refetch();
  }, [refetch]);

  // Snapshot says you haven't registered → send you to do that.
  useEffect(() => {
    if (notRegistered) router.replace(`/event/${eventId}/register`);
  }, [notRegistered, eventId, router]);

  useEffect(() => {
    if (state?.phase === "ended" && state.attendee_status === "arrived") {
      router.replace(`/event/${eventId}/recap`);
    }
  }, [state?.phase, state?.attendee_status, eventId, router]);

  if (notRegistered || (loading && !state)) {
    return (
      <LiveShell>
        <CenteredSpinner label="Finding your table…" />
      </LiveShell>
    );
  }

  if (error && !state) {
    return (
      <LiveShell>
        <div className="flex flex-col items-center gap-4 pt-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground">
            <WifiOff className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl text-foreground">Can&apos;t reach the event</h1>
            <p className="mt-2 text-sm text-muted-foreground">We&apos;ll keep trying. Check your connection.</p>
          </div>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
        </div>
      </LiveShell>
    );
  }

  if (!state) {
    return (
      <LiveShell>
        <CenteredSpinner label="Loading…" />
      </LiveShell>
    );
  }

  // Pre-registered but not yet checked in: gate the whole live experience behind
  // self-service room-code check-in (status flips registered -> arrived). Only
  // 'arrived' people are ever seated, so until they check in there's nothing to
  // show them. A 'left' attendee (organizer marked them gone, or they stepped
  // out) gets the same gate so they can re-check-in and rejoin the rotation. An
  // ended event skips straight to the recap below.
  if (
    (state.attendee_status === "registered" || state.attendee_status === "left") &&
    state.phase !== "ended"
  ) {
    return (
      <LiveShell eventId={eventId} eventName={state.event_name}>
        <RoomCodeCheckIn state={state} eventId={eventId} onArrived={refetch} />
      </LiveShell>
    );
  }

  switch (state.phase) {
    case "ended":
      if (state.attendee_status === "arrived") {
        return (
          <LiveShell eventId={eventId} eventName={state.event_name}>
            <CenteredSpinner label="Opening your recap…" />
          </LiveShell>
        );
      }
      return (
        <LiveShell eventId={eventId} eventName={state.event_name}>
          <EventEnded />
        </LiveShell>
      );
    case "between_rounds":
      return (
        <LiveShell eventId={eventId} eventName={state.event_name} onRefresh={refetch}>
          <BetweenRounds state={state} eventId={eventId} />
        </LiveShell>
      );
    case "in_round":
      return (
        <LiveShell eventId={eventId} eventName={state.event_name} onRefresh={refreshLiveState}>
          {state.seated ? (
            <RoundView
              state={state}
              eventId={eventId}
              onExpire={refetch}
              refreshVersion={manualRefreshVersion}
            />
          ) : (
            <NotSeated state={state} eventId={eventId} />
          )}
        </LiveShell>
      );
    case "not_started":
    default:
      return (
        <LiveShell eventId={eventId} eventName={state.event_name} onRefresh={refetch}>
          <WaitingRoom state={state} eventId={eventId} />
        </LiveShell>
      );
  }
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
