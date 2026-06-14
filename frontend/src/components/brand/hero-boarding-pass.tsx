"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { COLORS } from "@/lib/design/colors";
import type { Round } from "@/lib/design/rounds";
import type { StackPerson } from "./avatar-stack";

type Props = {
  round: Round;
  tableNumber: string;
  seat?: string;
  location?: string;
  icebreaker: string;
  tablemates: StackPerson[];
  roundLabel?: string;
  /** Resting tilt in degrees. */
  tilt?: number;
};

/**
 * The hero boarding pass — large, fluid (clamp-sized), light-context artifact for
 * the marketing hero. Animates in and tilts on hover. For in-app passes use
 * `BoardingPass`. See DESIGN_SYSTEM §6.
 */
export function HeroBoardingPass({
  round,
  tableNumber,
  seat = "3B",
  location = "By the window, near the bar",
  icebreaker,
  tablemates,
  roundLabel,
  tilt = 5,
}: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 40, rotate: tilt - 3 }}
      animate={reduce ? undefined : { opacity: 1, y: 0, rotate: tilt }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      whileHover={reduce ? undefined : { rotate: tilt - 1.5, y: -4 }}
      className="relative w-full overflow-hidden rounded-[clamp(20px,2.5vw,32px)]"
      style={{ boxShadow: "0 40px 80px -20px rgba(15,14,20,0.28), 0 15px 30px -10px rgba(255,90,60,0.15)" }}
    >
      {/* Top — round color */}
      <div
        className="relative overflow-hidden p-[clamp(18px,2.2vw,26px)] pb-[clamp(20px,2.5vw,28px)]"
        style={{ background: round.bg, color: round.ink }}
      >
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
        <div className="relative flex items-center justify-between text-[clamp(9px,0.8vw,11px)] font-medium uppercase tracking-[0.2em] opacity-90">
          <span>Boarding Pass · {roundLabel ?? "Round 1"}</span>
          <span>{round.name}</span>
        </div>
        <div className="relative mt-[clamp(28px,4.5vw,52px)] flex items-end justify-between">
          <div>
            <div className="mb-[clamp(6px,0.8vw,10px)] text-[clamp(9px,0.8vw,11px)] uppercase tracking-[0.22em] opacity-85">
              Your Table
            </div>
            <div className="font-display text-[clamp(88px,11vw,160px)] leading-[0.8] tracking-[-0.06em]">
              {tableNumber}
            </div>
          </div>
          {seat && (
            <div className="pb-[clamp(6px,0.8vw,12px)] text-right">
              <div className="text-[clamp(9px,0.8vw,11px)] uppercase tracking-[0.22em] opacity-85">Seat</div>
              <div className="mt-1.5 font-display text-[clamp(28px,3.2vw,44px)] leading-none">{seat}</div>
            </div>
          )}
        </div>
        {location && (
          <div className="relative mt-[clamp(10px,1.2vw,16px)] text-[clamp(12px,0.95vw,14px)] opacity-95">
            {location}
          </div>
        )}
      </div>

      {/* Perforation */}
      <div className="relative h-3" style={{ background: COLORS.ink }}>
        <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full" style={{ background: COLORS.paper }} />
        <div className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full" style={{ background: COLORS.paper }} />
        <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 border-t border-dashed border-white/20" />
      </div>

      {/* Bottom — dark icebreaker */}
      <div className="p-[clamp(16px,2.2vw,24px)]" style={{ background: COLORS.ink, color: COLORS.paper }}>
        <div className="mb-2.5 flex items-center gap-2 text-[clamp(9px,0.8vw,11px)] uppercase tracking-[0.22em] text-paper/65">
          <Sparkles className="h-3 w-3" style={{ color: round.bg }} /> Icebreaker
        </div>
        <p className="text-balance font-display text-[clamp(14px,1.2vw,18px)] italic leading-[1.15]">
          &ldquo;{icebreaker}&rdquo;
        </p>
        <div className="mt-[clamp(12px,1.5vw,18px)] flex items-center gap-2">
          {tablemates.map((t) => (
            <span
              key={t.id ?? t.name}
              className="flex items-center justify-center rounded-full text-[clamp(9px,0.75vw,11px)] font-semibold"
              style={{
                background: t.color,
                color: COLORS.ink,
                width: "clamp(20px,1.6vw,24px)",
                height: "clamp(20px,1.6vw,24px)",
              }}
            >
              {t.name[0]}
            </span>
          ))}
          <span className="ml-1 text-[clamp(10px,0.85vw,12px)] text-paper/70">
            {tablemates.map((t) => t.name.split(" ")[0]).join(", ")}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
