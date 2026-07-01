"use client";

import { useEffect } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Mic, Square } from "lucide-react";

import { AuroraOrb } from "@/components/ui/aurora-orb";
import { cn } from "@/lib/utils";

/**
 * "Aurora" — a WebGL voice orb: a glass sphere with flowing blue silk-light
 * ribbons inside (see AuroraOrb; CSS orb is the fallback). Idle = a slow calm
 * swirl; listening = the flow energises and the rim brightens. This component
 * adds the physics: a spring press and a **reactive bloom** that pulses the orb
 * each time new speech lands (`reactTo` changes) — applied to an OUTER wrapper so
 * it composes with the shader rather than fighting it. Fully reusable.
 * Reduced-motion holds a still glowing frame.
 */
export function VoiceOrb({
  listening,
  reactTo = "",
  onToggle,
  size = 96,
  disabled = false,
  className,
}: {
  listening: boolean;
  /** A value that changes as words arrive (e.g. the interim transcript) — each
   *  change thumps the orb so it visibly "hears" you. */
  reactTo?: string;
  onToggle: () => void;
  size?: number;
  disabled?: boolean;
  className?: string;
}) {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();

  // An extra heartbeat on each new chunk of speech. Skipped under reduced-motion.
  useEffect(() => {
    if (!listening || reduce || !reactTo) return;
    controls.start({
      scale: [1, 1.1, 1],
      transition: { duration: 0.5, ease: "easeOut" },
    });
  }, [reactTo, listening, reduce, controls]);

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop recording" : "Start a voice note"}
      className={cn(
        "vo cursor-pointer rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      data-live={listening ? "true" : "false"}
      style={{ height: size, width: size }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      {/* Glow behind the sphere. */}
      <span className="vo-halo" aria-hidden />

      {/* Outer wrapper carries the framer reactive bloom; the shader carries the
          swirl — nesting composes the two cleanly. */}
      <motion.span
        className="grid place-items-center"
        aria-hidden
        animate={controls}
        style={{ height: size, width: size }}
      >
        <AuroraOrb listening={listening} pulseSignal={reactTo} size={size} />
      </motion.span>

      {/* Glyph on top — mic idle, stop while live. */}
      <span
        className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-white"
        style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.4))" }}
        aria-hidden
      >
        {listening ? (
          <Square className="h-5 w-5 fill-white" strokeWidth={0} />
        ) : (
          <Mic className="h-6 w-6" strokeWidth={2.2} />
        )}
      </span>
    </motion.button>
  );
}
