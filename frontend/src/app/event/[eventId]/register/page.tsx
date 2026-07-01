"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarX2, CheckCircle2, Loader2 } from "lucide-react";

import {
  AuthShell,
  SignInPanel,
  RegisterForm,
  AccessCodeGate,
  type RegisterValues,
} from "@/components/auth";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { loadProfileDraft, saveProfileDraft, clearProfileDraft, hasProfileDefaults } from "@/lib/profile-draft";
import { supabase } from "@/lib/supabase";

interface EventSummary {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  location: string;
  organizer_id: string;
  requires_code: boolean;
  status: "upcoming" | "active" | "ended";
}

interface AttendeeResponse {
  id: string;
  event_id: string;
}

type ProfileDefaults = Partial<RegisterValues>;

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
  const [eventChecked, setEventChecked] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState<number>(0);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [existingChecked, setExistingChecked] = useState(false);
  const [existingAttendeeId, setExistingAttendeeId] = useState<string | null>(null);
  const [profileDefaults, setProfileDefaults] = useState<ProfileDefaults | null>(null);
  const [profileDefaultsChecked, setProfileDefaultsChecked] = useState(false);
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Event is public — load it up front so the "you're invited" header shows
  // even before sign-in.
  useEffect(() => {
    setEventChecked(false);
    apiFetch<EventSummary>(`/events/${eventId}`)
      .then(setEvent)
      .catch(() => setEvent(null))
      .finally(() => setEventChecked(true));
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

  useEffect(() => {
    if (!user) {
      setProfileDefaults(null);
      setProfileDefaultsChecked(false);
      return;
    }
    setProfileDefaultsChecked(false);
    // The backend is the single source (your global profile, set up at first
    // sign-in) — only fall back to the local draft cache on a network failure,
    // never to second-guess a genuinely empty server response.
    apiFetch<ProfileDefaults>(`/events/${eventId}/attendees/me/profile-defaults`)
      .then(setProfileDefaults)
      .catch(() => setProfileDefaults(loadProfileDraft(user.id)))
      .finally(() => setProfileDefaultsChecked(true));
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
    if (!user) {
      setError("Please sign in to join this event.");
      return;
    }
    const signedInUser = user;
    setError(null);
    setBusy(true);
    try {
      const attendee = await apiFetch<AttendeeResponse>(`/events/${eventId}/attendees`, {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          role: values.role,
          company: values.company || null,
          description: values.description || null,
          looking_for: values.looking_for || null,
          linkedin_url: values.linkedin_url || null,
          website_url: values.website_url || null,
          phone: values.phone || null,
          phone_dial_code: values.phone_dial_code || null,
          phone_visible: values.phone_visible,
          instagram: values.instagram || null,
          twitter: values.twitter || null,
          interests: values.interests,
          // Capture the OAuth (Google) profile photo so name cards show a face.
          avatar_url:
            (signedInUser.user_metadata?.avatar_url as string | undefined) ??
            (signedInUser.user_metadata?.picture as string | undefined) ??
            null,
          access_code: verifiedCode || null,
        }),
      });
      // Registration succeeded — the interrupted-fill recovery buffer is no longer
      // needed; the synced global profile is the prefill source from here on.
      clearProfileDraft(signedInUser.id);
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
    // "N already inside" is social proof for joining — it's misleading next to an
    // "event has ended / registration closed" panel, so hide it once the event is over.
    attendeeCount: event?.status === "ended" ? undefined : attendeeCount,
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

  if (!eventChecked) {
    return (
      <AuthShell {...shellProps}>
        <Centered>Loading invitation…</Centered>
      </AuthShell>
    );
  }

  if (!event) {
    return (
      <AuthShell {...shellProps}>
        <UnavailableEvent
          title="Event not found"
          message="This link no longer points to an available event."
          actionLabel="Back to home"
          onAction={() => router.push("/home")}
        />
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

  if (event.status === "ended") {
    return (
      <AuthShell {...shellProps}>
        <UnavailableEvent
          title="Event has ended"
          message="Registration is closed because this event is already over."
          actionLabel="Back to home"
          onAction={() => router.push("/home")}
        />
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

  if (!profileDefaultsChecked) {
    return (
      <AuthShell {...shellProps}>
        <Centered>Preparing your profile…</Centered>
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
        key={eventId}
        onSubmit={handleRegister}
        busy={busy}
        error={error}
        // Seed from the locally-saved draft when it has content — it's the most
        // recent thing the user typed (autosaved below), so an interrupted fill
        // (tab-switch/eviction) is restored instead of reset to the server profile.
        defaultValues={(() => {
          const draft = loadProfileDraft(user.id);
          return hasProfileDefaults(draft) ? draft : profileDefaults;
        })()}
        defaultName={
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined)
        }
        onAutosave={(v) => saveProfileDraft(user.id, v)}
      />
    </AuthShell>
  );
}

function UnavailableEvent({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card/60 text-muted-foreground">
        <CalendarX2 className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h2 className="font-display text-xl text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="lg" onClick={onAction} className="mt-1">
        {actionLabel}
      </Button>
    </div>
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
