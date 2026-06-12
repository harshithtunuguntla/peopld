"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

// Minimal session shell to verify organizer login works end-to-end.
// Event management UI lands in Step 7.
export default function OrganizerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setChecked(true);
      if (!data.user) router.replace("/organizer/login");
    });
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/organizer/login");
  }

  if (!checked || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Organizer Dashboard</h1>
      <p className="text-sm">
        Signed in as <strong>{user.email}</strong>
      </p>
      <p className="text-sm text-gray-500">
        Event management arrives in Step 7.
      </p>
      <button
        type="button"
        onClick={signOut}
        className="w-fit rounded border px-4 py-2"
      >
        Sign out
      </button>
    </main>
  );
}
