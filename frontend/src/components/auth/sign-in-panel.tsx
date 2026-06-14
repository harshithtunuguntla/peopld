"use client";

import { useState } from "react";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

type Step = "choose" | "otp-sent";

/** Brand-styled attendee sign-in: Google one-tap OR a 6-digit email code.
 * Two equal options (no password). Wired to Supabase Auth; on success the
 * session is set and the parent re-renders via onAuthStateChange. */
export function SignInPanel({ nextPath }: { nextPath: string }) {
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (error) setError(error.message);
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setStep("otp-sent");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
    // success: session set → parent re-renders.
  }

  return (
    <div className="flex flex-col gap-5">
      {step === "choose" ? (
        <>
          <header className="text-center">
            <h2 className="font-display text-xl text-cream">Sign in to continue</h2>
            <p className="mt-1 text-sm text-cream/55">Quick and free — no password to remember.</p>
          </header>

          <Button variant="paper" size="lg" onClick={signInWithGoogle} className="w-full gap-3">
            <GoogleMark /> Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs text-cream/40">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={sendOtp} className="flex flex-col gap-4">
            <Field label="Email" name="signin-email" required>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              )}
            </Field>
            <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full glow-ember">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {busy ? "Sending code…" : "Email me a login code"}
            </Button>
          </form>
        </>
      ) : (
        <form onSubmit={verifyOtp} className="flex flex-col gap-4">
          <header className="text-center">
            <h2 className="font-display text-xl text-cream">Check your inbox</h2>
            <p className="mt-1 text-sm text-cream/55">
              We sent a 6-digit code to <span className="font-medium text-cream">{email}</span>.
              Check spam if it&apos;s not there.
            </p>
          </header>
          <Field label="Login code" name="otp-code" required>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.5em]"
              />
            )}
          </Field>
          <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full glow-ember">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("choose");
              setCode("");
              setError(null);
            }}
            className="inline-flex items-center justify-center gap-1.5 text-sm text-cream/55 transition-colors hover:text-cream"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Use a different method
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Official multi-color Google "G". */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
