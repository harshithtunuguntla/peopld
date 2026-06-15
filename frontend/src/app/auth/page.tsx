"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUpRight, Loader2 } from "lucide-react";

import { SignInPanel } from "@/components/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "@/components/brand/wordmark";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

/** Only allow same-origin relative redirects (open-redirect guard). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/home";
  return raw;
}

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [checking, setChecking] = useState(true);

  // If already signed in, skip the form. Also catch sign-in completing here
  // (email code / Google) and continue to wherever they were headed.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) router.replace(next);
      else setChecking(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) router.replace(next);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, next]);

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading…
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* LEFT — dramatic brand island (always dark, desktop only). */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-10 text-cream lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-ember/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-plasma/20 blur-3xl" aria-hidden />

        <Link href="/" className="relative flex w-fit items-center gap-2.5">
          <Wordmark size={28} />
        </Link>

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20, rotate: 4 }}
            animate={{ opacity: 1, y: 0, rotate: 4 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-[300px]"
          >
            <div className="overflow-hidden rounded-[26px] shadow-2xl">
              <div className="relative bg-coral p-6 text-white" style={{ minHeight: 230 }}>
                <div className="text-[10px] uppercase tracking-[0.22em] opacity-90">
                  Boarding pass · Round 1
                </div>
                <div className="mt-6 font-display leading-[0.82] tracking-[-0.05em]" style={{ fontSize: 130 }}>
                  07
                </div>
                <div className="absolute right-6 top-20 text-right">
                  <div className="text-[10px] uppercase tracking-[0.22em] opacity-80">Seat</div>
                  <div className="font-display text-4xl">3B</div>
                </div>
              </div>
              <div className="relative h-3 bg-ink-950">
                <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-950" />
                <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-950" />
              </div>
              <div className="bg-ink-900 p-5">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cream/60">
                  <Sparkles className="h-3 w-3 text-coral" aria-hidden /> Icebreaker
                </div>
                <p className="font-display text-base italic leading-snug">
                  &ldquo;What felt suspiciously like magic this week?&rdquo;
                </p>
              </div>
            </div>
          </motion.div>

          <h2 className="mt-10 max-w-sm font-display text-4xl leading-[1.05] tracking-[-0.02em]">
            The room already knows <em className="italic text-ember">who you should meet.</em>
          </h2>
        </div>

        <div className="relative flex items-center gap-3 text-sm text-cream/60">
          <div className="flex -space-x-2" aria-hidden>
            {["bg-coral", "bg-gold", "bg-ice", "bg-chlorine", "bg-plasma"].map((c) => (
              <span key={c} className={`h-7 w-7 rounded-full border-2 border-ink-950 ${c}`} />
            ))}
          </div>
          <span>
            <span className="font-semibold text-cream">12,400+</span> connections made last month
          </span>
        </div>
      </aside>

      {/* RIGHT — the form (theme-aware). */}
      <div className="relative flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Wordmark size={26} />
          </div>

          {/* Sign in / Sign up — cosmetic framing (our auth is passwordless:
              the same Google / email-code flow creates an account or signs in). */}
          <div className="mb-7 inline-flex items-center rounded-full border border-border bg-secondary p-1">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="relative h-9 rounded-full px-5 text-sm font-medium transition-colors"
                style={{ color: mode === m ? "hsl(var(--accent-foreground))" : "hsl(var(--muted-foreground))" }}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-pill"
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  />
                )}
                <span className="relative">{m === "signin" ? "Sign in" : "Sign up"}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              <h1 className="font-display text-[clamp(28px,4vw,38px)] leading-[1.05] tracking-[-0.025em] text-foreground">
                {mode === "signin" ? (
                  <>Welcome back.</>
                ) : (
                  <>
                    Join the <em className="italic text-accent">room.</em>
                  </>
                )}
              </h1>
              <p className="mb-7 mt-1.5 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to find your table and your people."
                  : "No password, no app — just your email or Google."}
              </p>

              <SignInPanel
                nextPath={next}
                heading={mode === "signin" ? "Sign in to continue" : "Create your account"}
                subheading={
                  mode === "signin"
                    ? "Quick and free — no password to remember."
                    : "We'll email you a code — that's it."
                }
              />
            </motion.div>
          </AnimatePresence>

          <div className="mt-7 border-t border-border pt-5 text-center">
            <Link
              href="/organizer/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Hosting an event? <span className="font-medium text-accent">Organizer sign-in</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading…
        </div>
      }
    >
      <AuthInner />
    </Suspense>
  );
}
