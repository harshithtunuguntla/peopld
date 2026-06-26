"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

import { AuthShell, SignInPanel, AccessCodeGate } from "@/components/auth";
import { ApiError } from "@/lib/api";
import { resolveJoinCode } from "@/lib/join";
import { supabase } from "@/lib/supabase";

/**
 * The join landing — where the door QR points, and also where a shared invite
 * link points. A `?code=` query param prefills (and auto-submits) the access
 * code, so a personally-shared link/QR can drop someone straight onto the
 * register page instead of making them type a code read aloud in the room.
 * Typing the code by hand still works exactly as before — this is an
 * additional door, not a replacement. Stale/typo'd codes still fail server-side
 * and fall back to the manual gate, prefilled so they can fix it.
 */
export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <AuthShell brandHref="/home">
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        </AuthShell>
      }
    >
      <JoinPageInner />
    </Suspense>
  );
}

function JoinPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code")?.trim().toUpperCase() || null;

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [autoStatus, setAutoStatus] = useState<"checking" | "failed" | "idle">(
    codeParam ? "checking" : "idle",
  );

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

  const onVerify = useCallback(
    async (code: string) => {
      try {
        const { event_id } = await resolveJoinCode(code);
        router.push(`/event/${event_id}/register`);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return false; // wrong code
        throw err; // real failure → gate surfaces the message
      }
    },
    [router],
  );

  // A code arrived via the URL — verify it automatically once signed in, no tap
  // needed. Falls through to the manual gate (prefilled) if it turns out stale.
  useEffect(() => {
    if (!authChecked || !user || !codeParam || autoStatus !== "checking") return;
    let cancelled = false;
    onVerify(codeParam)
      .then((ok) => {
        if (!cancelled && !ok) setAutoStatus("failed");
      })
      .catch(() => {
        if (!cancelled) setAutoStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, user, codeParam, autoStatus, onVerify]);

  const nextPath = codeParam ? `/join?code=${encodeURIComponent(codeParam)}` : "/join";

  if (!authChecked) {
    return (
      <AuthShell brandHref="/home">
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell brandHref="/home">
        <SignInPanel nextPath={nextPath} />
      </AuthShell>
    );
  }

  if (autoStatus === "checking") {
    return (
      <AuthShell brandHref="/home">
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening your invite…
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell brandHref="/home">
      <AccessCodeGate onVerify={onVerify} initialCode={codeParam ?? undefined} />
    </AuthShell>
  );
}
