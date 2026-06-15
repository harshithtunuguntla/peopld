"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  AuthShell,
  SignInPanel,
  RegisterForm,
  AccessCodeGate,
  type RegisterValues,
} from "@/components/auth";
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
  requires_code: boolean;
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

const codeStorageKey = (eventId: string) => `peopld:event:${eventId}:code`;

export default function RegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [attendeeCount, setAttendeeCount] = useState<number>(0);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [existingChecked, setExistingChecked] = useState(false);
  const [existingAttendeeId, setExistingAttendeeId] = useState<string | null>(null);
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Event is public — load it up front so the "you're invited" header shows
  // even before sign-in.
  useEffect(() => {
    apiFetch<EventSummary>(`/events/${eventId}`)
      .then(setEvent)
      .catch(() => setEvent(null));
    apiFetch<{ attendee_count: number }>(`/events/${eventId}/stats`)
      .then((s) => setAttendeeCount(s.attendee_count))
      .catch(() => setAttendeeCount(0));
  }, [eventId]);

  // Restore a previously-verified code so a reload doesn't re-gate the user.
  useEffect(() => {
    setVerifiedCode(sessionStorage.getItem(codeStorageKey(eventId)));
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
      // Live state is resolved from the session, never the URL (PRODUCT.md hard rule).
      router.push(`/event/${eventId}/live`);
    }, 2500);
    return () => clearTimeout(timer);
  }, [existingAttendeeId, eventId, router]);

  const isEventOrganizer = useMemo(
    () => !!user && !!event && event.organizer_id === user.id,
    [user, event],
  );

  const handleVerifyCode = useCallback(
    async (code: string) => {
      const { valid } = await apiFetch<{ valid: boolean }>(`/events/${eventId}/verify-code`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (valid) {
        sessionStorage.setItem(codeStorageKey(eventId), code);
        setVerifiedCode(code);
      }
      return valid;
    },
    [eventId],
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
          interests: values.interests,
          // Capture the OAuth (Google) profile photo so name cards show a face.
          avatar_url:
            (user?.user_metadata?.avatar_url as string | undefined) ??
            (user?.user_metadata?.picture as string | undefined) ??
            null,
          access_code: verifiedCode || null,
        }),
      });
      router.push(`/event/${eventId}/live`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      // The code changed/expired between unlock and submit — send them back to the gate.
      if (/code/i.test(message)) {
        sessionStorage.removeItem(codeStorageKey(eventId));
        setVerifiedCode(null);
      }
      setError(message);
      setBusy(false);
    }
  }

  const eventMeta = formatEventMeta(event);
  const shellProps = {
    eventName: event?.name,
    eventMeta,
    attendeeCount,
  };

  // --- Render: one shell, swap the inner panel by state ---

  if (!authChecked) {
    return (
      <AuthShell {...shellProps}>
        <Centered>Loading…</Centered>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell {...shellProps}>
        <SignInPanel nextPath={`/event/${eventId}/register`} />
      </AuthShell>
    );
  }

  if (!existingChecked) {
    return (
      <AuthShell {...shellProps}>
        <Centered>Checking your registration…</Centered>
      </AuthShell>
    );
  }

  if (existingAttendeeId) {
    return (
      <AuthShell {...shellProps}>
        <AlreadyIn onGo={() => router.push(`/event/${eventId}/live`)} />
      </AuthShell>
    );
  }

  // Access-code gate: shown before the form when the event requires a code and
  // it hasn't been verified yet this session.
  if (event?.requires_code && !verifiedCode) {
    return (
      <AuthShell {...shellProps}>
        <AccessCodeGate onVerify={handleVerifyCode} />
      </AuthShell>
    );
  }

  return (
    <AuthShell {...shellProps}>
      {isEventOrganizer && (
        <div className="mb-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-foreground/80">
          You&apos;re signed in as this event&apos;s <strong className="text-foreground">organizer</strong>. Head to the{" "}
          <a href="/organizer/dashboard" className="font-medium text-warning underline underline-offset-2">
            organizer dashboard
          </a>
          , or continue below to also join as an attendee.
        </div>
      )}
      <RegisterForm
        onSubmit={handleRegister}
        busy={busy}
        error={error}
        defaultName={
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined)
        }
      />
    </AuthShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {children}
    </div>
  );
}

/** Returning attendee — a brief celebratory beat before the redirect fires. */
function AlreadyIn({ onGo }: { onGo: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <motion.div
        initial={reduce ? false : { scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="relative"
      >
        <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full ring-2 ring-chlorine"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
            aria-hidden
          />
        )}
      </motion.div>
      <h2 className="font-display text-xl text-foreground">You&apos;re already in</h2>
      <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
      <Button variant="outline" size="lg" onClick={onGo} className="mt-1">
        Go now
      </Button>
    </div>
  );
}
