"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

import { AuthShell, SignInPanel, AccessCodeGate } from "@/components/auth";
import { ApiError } from "@/lib/api";
import { resolveJoinCode } from "@/lib/join";
import { supabase } from "@/lib/supabase";

/**
 * The join landing — e.g. where the door QR points. By design there is NO way to
 * join from a URL: the access code is handed out *in the room* and must be typed
 * here. We deliberately ignore any `?code=` query param so a shared link can
 * never bypass the gate (PRODUCT.md: access-code is the only door in).
 */
export default function JoinPage() {
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
        <SignInPanel nextPath="/join" />
      </AuthShell>
    );
  }

  return (
    <AuthShell brandHref="/home">
      <AccessCodeGate onVerify={onVerify} />
    </AuthShell>
  );
}
