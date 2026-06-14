"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { SplitReveal } from "@/components/brand/split-reveal";
import { RevealOnScroll } from "@/components/brand/reveal-on-scroll";
import { SectionLabel } from "@/components/brand/section-label";
import { prefersReducedMotion } from "@/lib/design/motion";
import { COLORS } from "@/lib/design/colors";
import { TIMELINE, TIMELINE_GRADIENT } from "@/lib/content/landing";

/** A 90-minute event arc. A gradient spine fills top→bottom on scroll (GSAP). */
export function Timeline() {
  const lineRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const line = lineRef.current;
    const section = sectionRef.current;
    if (!line || !section || prefersReducedMotion()) return;
    gsap.set(line, { scaleY: 0, transformOrigin: "top" });
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            gsap.to(line, { scaleY: 1, duration: 2.2, ease: "expo.out" });
            io.disconnect();
          }
        }),
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  return (
    <section id="timeline" ref={sectionRef} className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="mb-12 max-w-2xl sm:mb-16">
          <RevealOnScroll>
            <SectionLabel className="mb-4 text-plasma">/ 90 minutes</SectionLabel>
          </RevealOnScroll>
          <h2 className="text-balance font-display text-[clamp(36px,5.5vw,76px)] leading-[0.98] tracking-[-0.025em]">
            <SplitReveal as="span" className="block">
              What an evening
            </SplitReveal>
            <SplitReveal as="span" className="block italic text-coral" delay={0.1}>
              actually looks like.
            </SplitReveal>
          </h2>
        </div>

        <div className="relative">
          <div
            ref={lineRef}
            className="absolute left-[26px] bottom-3 top-3 w-px sm:left-[36px]"
            style={{ background: `linear-gradient(to bottom, ${TIMELINE_GRADIENT.join(", ")})` }}
            aria-hidden
          />
          <div className="space-y-8 sm:space-y-12">
            {TIMELINE.map((step, i) => (
              <RevealOnScroll key={step.label} delay={i * 0.06}>
                <div className="flex items-start gap-4 sm:gap-7">
                  <div className="relative shrink-0">
                    <div
                      className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 font-mono text-[10px] backdrop-blur sm:h-[72px] sm:w-[72px] sm:text-xs"
                      style={{ background: `${COLORS.paper}80`, borderColor: step.color, color: step.color }}
                    >
                      {step.t}
                    </div>
                    <div className="absolute inset-0 -z-10 rounded-full opacity-30 blur-2xl" style={{ background: step.color }} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 pt-2 sm:pt-3">
                    <h3 className="font-display text-[clamp(22px,3vw,40px)] leading-tight tracking-[-0.02em]" style={{ color: step.color }}>
                      {step.label}
                    </h3>
                    <p className="mt-1.5 max-w-xl text-pretty text-[clamp(13px,1.05vw,16px)] text-ink/65 sm:mt-2">
                      {step.desc}
                    </p>
                  </div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
