"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CheckCircle2, Loader2 } from "lucide-react";

import { AuthShell, SignInPanel, RegisterForm, type RegisterValues } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface EventSummary {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  location: string;
  organizer_id: string;
}

interface AttendeeResponse {
  id: string;
  event_id: string;
}

/** Human "Sat, 14 Jun · The Garage" line for the auth header. */
function formatEventMeta(event: EventSummary | null): string | undefined {
  if (!event) return undefined;
  const day = new Date(`${event.date}T${event.time || "00:00:00"}`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return [day, event.location].filter(Boolean).join(" · ");
}

export default function RegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [existingChecked, setExistingChecked] = useState(false);
  const [existingAttendeeId, setExistingAttendeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Event is public — load it up front so the "you're joining X" header shows
  // even before sign-in.
  useEffect(() => {
    apiFetch<EventSummary>(`/events/${eventId}`)
      .then(setEvent)
      .catch(() => setEvent(null));
  }, [eventId]);

  // Auth state.
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

  // Already registered? Skip the form and head to the live dashboard.
  useEffect(() => {
    if (!user) {
      setExistingChecked(false);
      setExistingAttendeeId(null);
      return;
    }
    apiFetch<AttendeeResponse>(`/events/${eventId}/attendees/me`)
      .then((attendee) => setExistingAttendeeId(attendee.id))
      .catch(() => setExistingAttendeeId(null)) // 404 = not registered yet
      .finally(() => setExistingChecked(true));
  }, [user, eventId]);

  // Give returning attendees a beat to read the message before redirecting.
  useEffect(() => {
    if (!existingAttendeeId) return;
    const timer = setTimeout(() => {
      router.push(`/event/${eventId}/live?attendee=${existingAttendeeId}`);
    }, 2500);
    return () => clearTimeout(timer);
  }, [existingAttendeeId, eventId, router]);

  const isEventOrganizer = useMemo(
    () => !!user && !!event && event.organizer_id === user.id,
    [user, event],
  );

  async function handleRegister(values: RegisterValues) {
    setError(null);
    setBusy(true);
    try {
      const attendee = await apiFetch<AttendeeResponse>(`/events/${eventId}/attendees`, {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          role: values.role,
          looking_for: values.looking_for || null,
          linkedin_url: values.linkedin_url || null,
          whatsapp_number: values.whatsapp_number || null,
        }),
      });
      router.push(`/event/${eventId}/live?attendee=${attendee.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  const eventMeta = formatEventMeta(event);

  // --- Render: one shell, swap the inner panel by state ---

  if (!authChecked) {
    return (
      <AuthShell eventName={event?.name} eventMeta={eventMeta}>
        <Centered>Loading…</Centered>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell eventName={event?.name} eventMeta={eventMeta}>
        <SignInPanel nextPath={`/event/${eventId}/register`} />
      </AuthShell>
    );
  }

  if (!existingChecked) {
    return (
      <AuthShell eventName={event?.name} eventMeta={eventMeta}>
        <Centered>Checking your registration…</Centered>
      </AuthShell>
    );
  }

  if (existingAttendeeId) {
    const liveUrl = `/event/${eventId}/live?attendee=${existingAttendeeId}`;
    return (
      <AuthShell eventName={event?.name} eventMeta={eventMeta}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-chlorine" aria-hidden />
          <h2 className="font-display text-xl text-cream">You&apos;re already in</h2>
          <p className="text-sm text-cream/55">Taking you to your dashboard…</p>
          <Button variant="outline-dark" size="lg" onClick={() => router.push(liveUrl)} className="mt-1">
            Go now
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eventName={event?.name} eventMeta={eventMeta}>
      {isEventOrganizer && (
        <div className="mb-5 rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm text-cream/80">
          You&apos;re signed in as this event&apos;s <strong className="text-cream">organizer</strong>. Head to the{" "}
          <a href="/organizer/dashboard" className="font-medium text-gold underline underline-offset-2">
            organizer dashboard
          </a>
          , or continue below to also join as an attendee.
        </div>
      )}
      <RegisterForm onSubmit={handleRegister} busy={busy} error={error} />
    </AuthShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-cream/60">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {children}
    </div>
  );
}
