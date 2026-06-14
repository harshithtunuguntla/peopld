"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, ChevronRight } from "lucide-react";
import { PhoneFrame } from "@/components/brand/phone-frame";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { SplitReveal } from "@/components/brand/split-reveal";
import { RevealOnScroll } from "@/components/brand/reveal-on-scroll";
import { SCENE_MAP, SCENE_META, type SceneKey } from "./scenes";

const ROTATE_MS = 4500;

/** Dark "step inside" band: an auto-cycling phone tour of the attendee/organizer
 * scenes with a clickable picker. Dark-on-light island (sets its own dark colors). */
export function ScenesGallery() {
  const [active, setActive] = useState<SceneKey>("reveal");
  const [playing, setPlaying] = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    tickRef.current = setInterval(() => {
      setActive((cur) => {
        const i = SCENE_META.findIndex((s) => s.key === cur);
        return SCENE_META[(i + 1) % SCENE_META.length].key;
      });
    }, ROTATE_MS);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [playing]);

  const Active = SCENE_MAP[active];

  return (
    <section id="experience" className="relative overflow-hidden rounded-[40px] bg-ink-950 py-20 text-cream sm:py-28">
      <AuroraBackground intensity={0.8} />
      <div className="relative mx-auto max-w-[1320px] px-6 sm:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <RevealOnScroll>
              <div className="mb-5 text-[12px] uppercase tracking-[0.3em] text-ember">/ The experience</div>
            </RevealOnScroll>
            <h2 className="text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] sm:text-7xl">
              <SplitReveal as="span" className="block">
                Step inside.
              </SplitReveal>
              <SplitReveal as="span" className="block italic" delay={0.1}>
                This is what guests see.
              </SplitReveal>
            </h2>
          </div>
          <RevealOnScroll delay={0.2}>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            >
              {playing ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause auto-tour
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" /> Resume auto-tour
                </>
              )}
            </button>
          </RevealOnScroll>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[1fr_440px] lg:gap-12">
          {/* Picker */}
          <div className="order-2 space-y-2 lg:order-1">
            {SCENE_META.map((s, i) => {
              const isActive = active === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setActive(s.key);
                    setPlaying(false);
                  }}
                  aria-pressed={isActive}
                  className={`group relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
                    isActive
                      ? "border-ember bg-ember/[0.06]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="scene-pill"
                      className="absolute bottom-0 left-0 top-0 w-1 bg-ember"
                      transition={{ type: "spring", stiffness: 240, damping: 26 }}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-cream/40">
                        {`Scene ${String(i + 1).padStart(2, "0")}`}
                      </div>
                      <div className="font-display text-xl tracking-[-0.01em]">{s.label}</div>
                      <div className="mt-0.5 text-xs text-cream/55">{s.sub}</div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 transition ${isActive ? "text-ember" : "text-cream/30 group-hover:text-cream/60"}`}
                    />
                  </div>
                  {isActive && playing && (
                    <motion.div
                      key={active}
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: ROTATE_MS / 1000, ease: "linear" }}
                      className="absolute bottom-0 left-0 h-0.5 bg-ember"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Phone */}
          <div className="relative order-1 flex justify-center lg:order-2">
            <div className="absolute inset-0 -z-10 flex items-center justify-center" aria-hidden>
              <div className="h-[440px] w-[440px] rounded-full bg-ember opacity-30 blur-[100px]" />
            </div>
            <PhoneFrame>
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.4 }}
                  className="h-full"
                >
                  <Active />
                </motion.div>
              </AnimatePresence>
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
