"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { COLORS } from "@/lib/design/colors";

type Props = {
  text: string;
  meta?: string;
  label?: string;
  tilt?: number;
  delay?: number;
};

/** The lime "AI gift" card that peeks from behind the hero boarding pass. */
export function AIGiftCard({ text, meta, label = "AI Gift", tilt = -10, delay = 0.55 }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -40, rotate: tilt - 4 }}
      animate={reduce ? undefined : { opacity: 1, x: 0, rotate: tilt }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay }}
      whileHover={reduce ? undefined : { rotate: tilt + 2, y: -2 }}
      className="w-full rounded-[clamp(16px,1.8vw,24px)] p-[clamp(14px,1.6vw,20px)] shadow-2xl"
      style={{ background: COLORS.lime, color: COLORS.ink }}
    >
      <div className="mb-2.5 flex items-center gap-2 text-[clamp(8px,0.7vw,10px)] font-medium uppercase tracking-[0.22em]">
        <Sparkles className="h-3 w-3" /> {label}
      </div>
      <p className="font-display text-[clamp(14px,1.3vw,20px)] italic leading-[1.1]">&ldquo;{text}&rdquo;</p>
      {meta && <div className="mt-3 text-[clamp(9px,0.75vw,11px)] opacity-60">{meta}</div>}
    </motion.div>
  );
}
