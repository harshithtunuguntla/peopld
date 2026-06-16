"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AccessCodeGateProps {
  /** Verify the code with the backend. Resolve true to unlock, false if wrong. */
  onVerify: (code: string) => Promise<boolean>;
}

/**
 * The registration gate: attendees enter the short code the organizer announces
 * in the room before the profile form unlocks. A single uppercase field (not
 * fixed segments) — organizer codes vary in length, and one field is the most
 * robust input on mobile keyboards. Verification is case-insensitive server-side.
 */
export function AccessCodeGate({ onVerify }: AccessCodeGateProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the code the organizer shared.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await onVerify(code.trim());
      if (!ok) setError("That code didn't work — double-check with the organizer.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <header className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="font-display text-xl text-foreground">Enter the event code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The organizer will read it out — pop it in to unlock your registration.
        </p>
      </header>

      <div>
        <label htmlFor="event-code" className="sr-only">
          Event code
        </label>
        <Input
          id="event-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="MIXER"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-invalid={!!error}
          className="text-center font-display text-2xl uppercase tracking-[0.4em]"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" variant="accent" size="xl" disabled={busy} className="w-full glow-ember">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Checking…" : "Unlock"}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </Button>
    </form>
  );
}
