"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/organizer/dashboard");
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-5 py-12 text-foreground">
      <AuroraBackground intensity={0.5} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.15]" aria-hidden />

      <main className="relative z-10 w-full max-w-sm">
        <Wordmark size={26} className="mb-8" />
        <div className="rounded-3xl border border-border bg-card/70 px-6 py-7 backdrop-blur-sm">
          <header className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <h1 className="font-display text-xl text-foreground">Organizer sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Run your event&apos;s command center.</p>
          </header>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Field label="Email" name="org-email" required>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              )}
            </Field>
            <Field label="Password" name="org-password" required>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              )}
            </Field>
            <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full glow-ember">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            {error && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
