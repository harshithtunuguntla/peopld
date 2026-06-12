"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabase } from "@/lib/supabase";

export default function OrganizerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/organizer/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <form
        onSubmit={handleLogin}
        className="flex w-full max-w-sm flex-col gap-3"
      >
        <h1 className="text-xl font-semibold">Organizer Login</h1>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border px-4 py-3"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border px-4 py-3"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded border px-4 py-3 font-medium disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
