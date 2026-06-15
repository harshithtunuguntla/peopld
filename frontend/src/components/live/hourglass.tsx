"use client";

import { motion, useReducedMotion } from "framer-motion";
import { COLORS } from "@/lib/design/colors";

/**
 * The waiting-room hourglass. There's no real countdown — the host starts the
 * first round by hand — so instead of a fake timer we show time *passing*: warm
 * sand pours from a full top bulb into the bottom, then the glass flips and repeats.
 *
 * Implementation notes (learned the hard way):
 *  - Sand level is animated via a **mask rectangle's `height`**, NOT a `scaleY`
 *    transform. framer animates SVG attributes (`height`, `cy`, `r`) reliably,
 *    but maps `x`/`y`/`scale` to CSS transforms that misbehave on clipped SVG
 *    shapes in some engines (the old version rendered both bulbs full). Masking
 *    the top bulb from the top down = the surface visibly lowers (natural drain).
 *  - The whole glass flips 180° once per loop. The flip and the sand reset share
 *    one clock, so at the loop boundary a *drained glass at 180°* is identical to
 *    a *full glass at 0°* — the restart is invisible and sand always falls down.
 *  - Static fallback (no JS / reduced motion) is full-top / empty-bottom, never
 *    the broken state.
 */
export function Hourglass({ size = 128 }: { size?: number }) {
  const reduce = useReducedMotion();

  const W = 80;
  const H = 116;
  const CYCLE = 4.2; // seconds per turn
  const T = [0, 0.8, 1] as const; // pour for 80%, flip in the last 20%
  const flow = { duration: CYCLE, repeat: Infinity, ease: "linear", times: T } as const;

  // Bulb silhouettes (shared by glass tint, sand fill, and clip/outline).
  const TOP = "M18 18 H62 C62 40 44 50 40 58 C36 50 18 40 18 18 Z";
  const BOT = "M40 58 C44 66 62 76 62 98 H18 C18 76 36 66 40 58 Z";

  return (
    <motion.div
      className="relative inline-grid place-items-center"
      animate={reduce ? undefined : { y: [0, -5, 0] }}
      transition={reduce ? undefined : { duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* breathing aura */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-full bg-accent/25 blur-2xl"
        style={{ width: size * 0.78, height: size * 0.78 }}
        animate={reduce ? undefined : { opacity: [0.4, 0.75, 0.4], scale: [0.9, 1.05, 0.9] }}
        transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.svg
        width={size}
        height={size * (H / W)}
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        className="relative text-foreground/60"
        aria-hidden
        animate={reduce ? undefined : { rotate: [0, 0, 180] }}
        transition={reduce ? undefined : { ...flow, ease: "easeInOut" }}
        style={{ transformOrigin: "50% 50%" }}
      >
        <defs>
          <linearGradient id="hg-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={COLORS.gold} />
            <stop offset="0.5" stopColor={COLORS.coral} />
            <stop offset="1" stopColor={COLORS.ember} />
          </linearGradient>
          <linearGradient id="hg-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>

          {/* Top bulb: black cover grows DOWN from the top → surface lowers. */}
          <mask id="hg-top-mask">
            <rect x="0" y="0" width={W} height={H} fill="white" />
            <motion.rect
              x="12"
              y="18"
              width="56"
              fill="black"
              initial={{ height: reduce ? 24 : 0 }}
              animate={reduce ? undefined : { height: [0, 40, 40] }}
              transition={reduce ? undefined : flow}
            />
          </mask>
          {/* Bottom bulb: black cover shrinks UP from the neck → fills from base. */}
          <mask id="hg-bot-mask">
            <rect x="0" y="0" width={W} height={H} fill="white" />
            <motion.rect
              x="12"
              y="58"
              width="56"
              fill="black"
              initial={{ height: reduce ? 16 : 40 }}
              animate={reduce ? undefined : { height: [40, 0, 0] }}
              transition={reduce ? undefined : flow}
            />
          </mask>
        </defs>

        {/* glass interior tint */}
        <path d={TOP} fill="url(#hg-glass)" />
        <path d={BOT} fill="url(#hg-glass)" />

        {/* the sand */}
        <path d={TOP} fill="url(#hg-sand)" mask="url(#hg-top-mask)" />
        <path d={BOT} fill="url(#hg-sand)" mask="url(#hg-bot-mask)" />

        {/* pouring column + falling grains (hidden during the flip) */}
        {!reduce && (
          <motion.g
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: CYCLE, repeat: Infinity, ease: "linear", times: [0, 0.74, 0.8, 1] }}
          >
            <rect x="37.5" y="56" width="5" height="36" rx="2.5" fill="url(#hg-sand)" opacity="0.9" />
            {[0, 0.2, 0.4, 0.6].map((delay) => (
              <motion.circle
                key={delay}
                cx="40"
                r="1.7"
                fill={COLORS.ember}
                animate={{ cy: [58, 92], opacity: [0, 1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "easeIn", delay }}
              />
            ))}
          </motion.g>
        )}

        {/* glass outline + caps */}
        <path
          d={`${TOP} ${BOT}`}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          fill="none"
          opacity="0.75"
        />
        <rect x="10" y="6" width="60" height="10" rx="5" fill="currentColor" opacity="0.88" />
        <rect x="10" y="100" width="60" height="10" rx="5" fill="currentColor" opacity="0.88" />
      </motion.svg>
    </motion.div>
  );
}
