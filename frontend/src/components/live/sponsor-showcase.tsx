"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import type { EventBranding, Sponsor } from "@/lib/live/use-branding";
import { cn } from "@/lib/utils";
import { Hourglass } from "./hourglass";

const ROTATE_MS = 5000;
const STAGE_MS = 4200; // dwell per slide in the hourglass↔sponsor rotation

/* eslint-disable @next/next/no-img-element -- sponsor/logo images are arbitrary
   organizer-supplied URLs; next/image would need a domain allowlist we can't
   know ahead of time. Plain <img> with lazy loading is the right call here. */

/** The event/host logo, shown when the organizer has one AND co-branding is on. */
export function EventLogo({ branding, className }: { branding: EventBranding | null; className?: string }) {
  if (!branding?.show_event_logo || !branding.logo_url) return null;
  return (
    <img
      src={branding.logo_url}
      alt={branding.event_name || "Event logo"}
      loading="lazy"
      className={cn("mx-auto max-h-12 w-auto object-contain", className)}
    />
  );
}

/** Rotating sponsor showcase for the between-rounds / lobby dead time. Crossfades
 * through sponsors every few seconds; under reduced-motion it shows a calm static
 * stack instead. Renders nothing when there are no sponsors (caller's fallback). */
export function SponsorShowcase({ sponsors, className }: { sponsors: Sponsor[]; className?: string }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const many = sponsors.length > 1;

  useEffect(() => {
    if (!many || reduced) return;
    const t = setInterval(() => setI((p) => (p + 1) % sponsors.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [many, reduced, sponsors.length]);

  if (sponsors.length === 0) return null;

  if (reduced && many) {
    return (
      <div className={cn("w-full", className)}>
        <Label />
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {sponsors.map((s) => (
            <SponsorCard key={s.id} sponsor={s} compact />
          ))}
        </div>
      </div>
    );
  }

  const active = sponsors[i % sponsors.length];
  return (
    <div className={cn("w-full", className)}>
      <Label />
      <div className="relative mt-3 min-h-[140px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <SponsorCard sponsor={active} />
          </motion.div>
        </AnimatePresence>
      </div>
      {many && (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {sponsors.map((s, idx) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === i % sponsors.length ? "w-4 bg-accent" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The waiting hero: ONE slot that crossfades the hourglass with each sponsor in
 * turn (hourglass → sponsor 1 → sponsor 2 → … → hourglass). This gives sponsors
 * the centre of the screen at eye level — instead of a card buried below the fold
 * that attendees never scroll to — while the hourglass keeps the "we're waiting"
 * feeling alive. With no sponsors it's simply the hourglass. Under reduced motion
 * it's the hourglass plus a calm static sponsor stack (no movement).
 */
export function WaitingStage({
  sponsors,
  hourglassSize = 120,
  className,
}: {
  sponsors: Sponsor[];
  hourglassSize?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const slideCount = 1 + sponsors.length; // slide 0 = hourglass
  const [i, setI] = useState(0);

  useEffect(() => {
    if (slideCount <= 1 || reduced) return;
    const t = setInterval(() => setI((p) => (p + 1) % slideCount), STAGE_MS);
    return () => clearInterval(t);
  }, [slideCount, reduced]);

  // No sponsors → just the hourglass, exactly as before.
  if (sponsors.length === 0) {
    return (
      <div className={cn("flex flex-col items-center", className)}>
        <Hourglass size={hourglassSize} />
      </div>
    );
  }

  // Reduced motion → hourglass + a static sponsor stack (no rotation/animation).
  if (reduced) {
    return (
      <div className={cn("flex w-full flex-col items-center gap-5", className)}>
        <Hourglass size={hourglassSize} />
        <div className="w-full">
          <Label />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {sponsors.map((s) => (
              <SponsorCard key={s.id} sponsor={s} compact />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const slot = i % slideCount;
  const onHourglass = slot === 0;
  const sponsor = onHourglass ? null : sponsors[(slot - 1) % sponsors.length];

  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <div className="relative flex min-h-[190px] w-full items-center justify-center">
        <AnimatePresence mode="wait">
          {onHourglass ? (
            <motion.div
              key="hourglass"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.45 }}
            >
              <Hourglass size={hourglassSize} />
            </motion.div>
          ) : (
            <motion.div
              key={sponsor!.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45 }}
              className="w-full px-2"
            >
              <SponsorHero sponsor={sponsor!} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
        {Array.from({ length: slideCount }).map((_, idx) => (
          <span
            key={idx}
            className={cn(
              "h-1.5 rounded-full transition-all",
              idx === slot ? "w-4 bg-accent" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** A sponsor shown front-and-centre in the waiting hero (no card chrome — it owns
 *  the slot). Logo or name, tagline, and a visit affordance. */
function SponsorHero({ sponsor }: { sponsor: Sponsor }) {
  const inner = (
    <div className="text-center">
      <Label />
      <div className="mt-3 flex flex-col items-center">
        {sponsor.image_url ? (
          <img
            src={sponsor.image_url}
            alt={sponsor.name}
            loading="lazy"
            className="max-h-20 w-auto object-contain"
          />
        ) : (
          <div className="font-display text-3xl text-foreground">{sponsor.name}</div>
        )}
        {sponsor.image_url && <div className="mt-3 font-medium text-foreground">{sponsor.name}</div>}
        {sponsor.tagline && <p className="mt-1.5 max-w-[280px] text-sm text-muted-foreground">{sponsor.tagline}</p>}
        {sponsor.url && (
          <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
            Visit <ArrowUpRight className="h-3 w-3" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
  return sponsor.url ? (
    <a href={sponsor.url} target="_blank" rel="noopener noreferrer" className="block transition-opacity hover:opacity-90">
      {inner}
    </a>
  ) : (
    <div>{inner}</div>
  );
}

function Label() {
  return (
    <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
      Proudly sponsored by
    </p>
  );
}

function SponsorCard({ sponsor, compact }: { sponsor: Sponsor; compact?: boolean }) {
  const inner = (
    <>
      {sponsor.image_url ? (
        <img
          src={sponsor.image_url}
          alt={sponsor.name}
          loading="lazy"
          className={cn("mx-auto w-auto object-contain", compact ? "max-h-10" : "max-h-16")}
        />
      ) : (
        <div className={cn("font-display text-foreground", compact ? "text-lg" : "text-2xl")}>{sponsor.name}</div>
      )}
      {sponsor.image_url && (
        <div className={cn("font-medium text-foreground", compact ? "mt-1.5 text-xs" : "mt-2.5 text-sm")}>
          {sponsor.name}
        </div>
      )}
      {sponsor.tagline && !compact && <p className="mt-1 text-xs text-muted-foreground">{sponsor.tagline}</p>}
      {sponsor.url && !compact && (
        <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
          Visit <ArrowUpRight className="h-3 w-3" aria-hidden />
        </span>
      )}
    </>
  );
  const base = cn(
    "block rounded-2xl border border-border bg-card/60 text-center",
    compact ? "p-3" : "p-5",
  );
  return sponsor.url ? (
    <a
      href={sponsor.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, "transition-colors hover:border-accent/40 hover:bg-accent/[0.05]")}
    >
      {inner}
    </a>
  ) : (
    <div className={base}>{inner}</div>
  );
}
