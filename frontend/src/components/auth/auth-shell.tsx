import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";

interface AuthShellProps {
  children: ReactNode;
  /** Event name — rendered as the big editorial headline (last word in amber). */
  eventName?: string;
  /** Secondary line under the title (e.g. "Sat, 14 Jun · The Garage"). */
  eventMeta?: string;
  /** Social-proof count: "{n} already inside". Hidden when 0/undefined. */
  attendeeCount?: number;
  /** Eyebrow above the title. */
  eyebrow?: string;
}

/**
 * Branded backdrop for every onboarding screen (sign-in, register, code gate,
 * loading). Mirrors the "01 Join" app scene: amber Peopld wordmark top-left, a
 * big editorial event title, a location line, and decorative social proof — then
 * the content card. Theme-agnostic: semantic tokens, inherits dark from the
 * route-segment layout. See DESIGN_SYSTEM §1.5 + §6.
 */
export function AuthShell({
  children,
  eventName,
  eventMeta,
  attendeeCount,
  eyebrow = "You're invited",
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-5 py-12 text-foreground">
      <AuroraBackground intensity={0.5} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.15]" aria-hidden />

      <main className="relative z-10 w-full max-w-md">
        <Wordmark size={26} className="mb-8" />

        {eventName && (
          <header className="mb-7">
            <p className="text-[11px] uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
            <h1 className="mt-2 font-display text-3xl leading-[1.05] tracking-[-0.02em] text-foreground sm:text-4xl">
              <EventTitle name={eventName} />
            </h1>
            {eventMeta && (
              <p className="mt-2.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {eventMeta}
              </p>
            )}
            {attendeeCount ? <SocialProof count={attendeeCount} className="mt-4" /> : null}
          </header>
        )}

        <div className="rounded-3xl border border-border bg-card/70 px-6 py-6 backdrop-blur-sm sm:px-8 sm:py-7">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Headline with the final word set in amber italic — the scene's editorial accent. */
function EventTitle({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return <>{name}</>;
  const last = parts.pop();
  return (
    <>
      {parts.join(" ")} <em className="not-italic font-display italic text-accent">{last}</em>
    </>
  );
}

/** Decorative social proof — seeded brand-color dots (NO real attendee data) + count. */
function SocialProof({ count, className }: { count: number; className?: string }) {
  const dots = ["bg-coral", "bg-gold", "bg-ice", "bg-chlorine"];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex -space-x-1.5" aria-hidden>
        {dots.map((bg) => (
          <span key={bg} className={cn("h-5 w-5 rounded-full border-2 border-background", bg)} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{count}</span> already inside
      </span>
    </div>
  );
}
