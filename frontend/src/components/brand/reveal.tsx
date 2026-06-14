"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Animation start offset in px (default 8). */
  y?: number;
  /** Delay in seconds (use index * 0.05 for staggered lists). */
  delay?: number;
  /** Fire once when scrolled into view (default true). */
  once?: boolean;
};

/**
 * Standard scroll-in entrance, reduced-motion safe. The single place the landing
 * animates content blocks. See docs/design/DESIGN_SYSTEM.md §5.
 */
export function Reveal({ children, className, y = 8, delay = 0, once = true }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}
