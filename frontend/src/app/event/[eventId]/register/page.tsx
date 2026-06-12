"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import AttendeeAuth from "@/components/AttendeeAuth";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface AttendeeResponse {
  id: string;
  event_id: string;
}

export default function RegisterPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isEventOrganizer, setIsEventOrganizer] = useState(false);
  const [existingChecked, setExistingChecked] = useState(false);
  const [existingAttendeeId, setExistingAttendeeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // One identity can hold both roles: organizers may also attend their own
  // event. We don't block them — we just make sure they know who they're
  // signed in as.
  useEffect(() => {
    if (!user) {
      setIsEventOrganizer(false);
      return;
    }
    apiFetch<{ organizer_id: string }>(`/events/${eventId}`)
      .then((event) => setIsEventOrganizer(event.organizer_id === user.id))
      .catch(() => setIsEventOrganizer(false));
  }, [user, eventId]);

  // Already registered? Skip the form entirely.
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

  // Give returning attendees a moment to read the message before redirecting.
  useEffect(() => {
    if (!existingAttendeeId) return;
    const timer = setTimeout(() => {
      router.push(`/event/${eventId}/live?attendee=${existingAttendeeId}`);
    }, 3000);
    return () => clearTimeout(timer);
  }, [existingAttendeeId, eventId, router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const attendee = await apiFetch<AttendeeResponse>(
        `/events/${eventId}/attendees`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            role,
            looking_for: lookingFor || null,
            linkedin_url: linkedin || null,
            whatsapp_number: whatsapp || null,
          }),
        }
      );
      // Existing registrations are returned too (dedupe) — same destination.
      router.push(`/event/${eventId}/live?attendee=${attendee.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p>Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <AttendeeAuth nextPath={`/event/${eventId}/register`} />
      </main>
    );
  }

  if (!existingChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p>Checking your registration...</p>
      </main>
    );
  }

  if (existingAttendeeId) {
    const liveUrl = `/event/${eventId}/live?attendee=${existingAttendeeId}`;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">You&apos;re already registered ✅</h1>
        <p className="text-sm text-gray-600">
          Taking you to your event dashboard in a moment...
        </p>
        <a href={liveUrl} className="text-sm underline">
          Go now
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-6">
      <form
        onSubmit={handleRegister}
        className="flex w-full max-w-sm flex-col gap-3"
      >
        <h1 className="text-xl font-semibold">Register</h1>
        {isEventOrganizer && (
          <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
            You&apos;re signed in as this event&apos;s <strong>organizer</strong>.
            Looking for the{" "}
            <a href="/organizer/dashboard" className="underline">
              organizer dashboard
            </a>
            ? Or continue below to also join as an attendee.
          </p>
        )}
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded border px-4 py-3"
        />
        <input
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder='Role (e.g. "Founder at XYZ")'
          className="w-full rounded border px-4 py-3"
        />
        <input
          value={lookingFor}
          onChange={(e) => setLookingFor(e.target.value)}
          placeholder='Looking for (e.g. "investors, designers")'
          className="w-full rounded border px-4 py-3"
        />
        <input
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          placeholder="LinkedIn URL (optional)"
          className="w-full rounded border px-4 py-3"
        />
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="WhatsApp number (optional)"
          className="w-full rounded border px-4 py-3"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded border px-4 py-3 font-medium disabled:opacity-50"
        >
          {busy ? "Joining..." : "Join the event"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
