"use client";

import { useState } from "react";

import { supabase } from "@/lib/supabase";

type Step = "choose" | "otp-sent";

// Two equal sign-in options: Google one-tap OR a 6-digit email code.
// Functional-only for Step 3 — styled properly in Step 7.
export default function AttendeeAuth({ nextPath }: { nextPath: string }) {
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
    if (error) {
      setError(error.message);
      return;
    }
    setStep("otp-sent");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Session is set; the parent page re-renders via onAuthStateChange.
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Sign in to join</h1>

      {step === "choose" && (
        <>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="w-full rounded border px-4 py-3 font-medium"
          >
            Continue with Google
          </button>

          <div className="text-center text-sm text-gray-500">or</div>

          <form onSubmit={sendOtp} className="flex flex-col gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded border px-4 py-3"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded border px-4 py-3 font-medium disabled:opacity-50"
            >
              {busy ? "Sending..." : "Email me a login code"}
            </button>
          </form>
        </>
      )}

      {step === "otp-sent" && (
        <form onSubmit={verifyOtp} className="flex flex-col gap-2">
          <p className="text-sm">
            We sent a 6-digit code to <strong>{email}</strong>. Check spam if
            you don&apos;t see it.
          </p>
          <input
            type="text"
            inputMode="numeric"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full rounded border px-4 py-3 tracking-widest"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded border px-4 py-3 font-medium disabled:opacity-50"
          >
            {busy ? "Verifying..." : "Verify code"}
          </button>
          <button
            type="button"
            onClick={() => setStep("choose")}
            className="text-sm text-gray-500 underline"
          >
            Use a different method
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
