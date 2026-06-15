"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Auth gate for organizer surfaces. Resolves the session and redirects to
 * /organizer/login when signed out. Role is enforced server-side on every API
 * call (403 for non-organizers); this is just the client-side guard + identity.
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

  useEffect(() => {
    if (checked && !user) router.replace("/organizer/login");
  }, [checked, user, router]);

  return { user, checked };
}
