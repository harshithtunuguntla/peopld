"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Auth + ROLE gate for organizer surfaces. Resolves the session and the user's
 * role (`app_metadata.role === "organizer"` — the same claim the API enforces on
 * every call, set server-side via scripts/tag_organizer.py).
 *
 *   - signed out                → /organizer/login
 *   - signed in, NOT organizer  → /home (an attendee who pasted a console URL;
 *                                 we never paint the console chrome for them)
 *   - signed in organizer       → render
 *
 * Role is still enforced server-side (403). This is the client guard that keeps
 * a non-organizer from ever *seeing* the console — fixing the old leak where an
 * attendee saw the full console shell with a "not authenticated" error inside.
 * For non-organizers we return `user: null`, so the page stays on its skeleton
 * (no event data is fetched) until the redirect lands.
 */
export function useOrganizer() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const isOrganizer =
    (user?.app_metadata as { role?: string } | undefined)?.role === "organizer";

  useEffect(() => {
    if (!checked) return;
    if (!user) router.replace("/organizer/login");
    else if (!isOrganizer) router.replace("/home");
  }, [checked, user, isOrganizer, router]);

  return { user: isOrganizer ? user : null, checked, isOrganizer };
}
