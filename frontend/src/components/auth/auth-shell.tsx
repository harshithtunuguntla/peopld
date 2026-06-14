import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { AuroraBackground } from "@/components/brand/aurora-background";

interface AuthShellProps {
  children: ReactNode;
  /** Event name shown in the context header, so guests confirm where they're joining. */
  eventName?: string;
  /** Secondary line under the event name (e.g. "Sat, Jun 14 · The Garage"). */
  eventMeta?: string;
}

/**
 * The dark, branded backdrop for every onboarding screen (sign-in, register,
 * already-registered, loading). Applies the `dark` token context so the shared
 * form primitives resolve to their dark variants. App surface — never wrapped in
 * a PhoneFrame. See DESIGN_SYSTEM §2.
 */
export function AuthShell({ children, eventName, eventMeta }: AuthShellProps) {
  return (
    <div className="dark relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink-950 px-5 py-10 text-cream">
      <AuroraBackground intensity={0.5} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.15]" aria-hidden />

      <main className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={44} dark />
          {eventName && (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-[0.3em] text-ember">You&apos;re joining</p>
              <h1 className="mt-1.5 font-display text-2xl leading-tight tracking-[-0.01em] text-cream sm:text-3xl">
                {eventName}
              </h1>
              {eventMeta && <p className="mt-1 text-sm text-cream/55">{eventMeta}</p>}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
