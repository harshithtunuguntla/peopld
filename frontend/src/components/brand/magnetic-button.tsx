"use client";

import { useRef, type ReactNode, type PointerEvent } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

type Props = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  strength?: number;
  "aria-label"?: string;
};

/** Button that drifts toward the cursor. Reduced-motion: static button. */
export function MagneticButton({ children, className = "", onClick, strength = 0.35, ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 20, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 20, mass: 0.4 });

  const handleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      onPointerMove={handleMove}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      onClick={onClick}
      style={reduce ? undefined : { x: sx, y: sy }}
      className={className}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
