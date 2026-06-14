"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/design/motion";

/** Slow-drifting ember/plasma/chlorine aurora for dark sections. Reduced-motion:
 * paints a single static gradient. Purely decorative (pointer-events-none). */
export function AuroraBackground({ intensity = 1 }: { intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const paint = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      el.style.backgroundImage = `
        radial-gradient(60% 50% at ${x1}% ${y1}%, rgba(255, 78, 43, ${0.35 * intensity}) 0%, transparent 60%),
        radial-gradient(50% 45% at ${x2}% ${y2}%, rgba(182, 108, 255, ${0.3 * intensity}) 0%, transparent 60%),
        radial-gradient(45% 40% at ${x3}% ${y3}%, rgba(168, 255, 122, ${0.2 * intensity}) 0%, transparent 60%)`;
    };

    if (prefersReducedMotion()) {
      paint(20, 20, 80, 80, 60, 40);
      return;
    }

    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.0035;
      paint(
        20 + Math.sin(t) * 15,
        20 + Math.cos(t * 0.7) * 10,
        80 + Math.cos(t * 0.6) * 12,
        80 + Math.sin(t * 0.9) * 8,
        60 + Math.sin(t * 1.1) * 18,
        40 + Math.cos(t * 0.5) * 12,
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [intensity]);

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div ref={ref} className="absolute inset-0 blur-[80px]" />
      <div className="absolute inset-0 bg-ink-950/40" />
    </div>
  );
}
