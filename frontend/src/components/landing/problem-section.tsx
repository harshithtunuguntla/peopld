import { SectionLabel } from "@/components/brand/section-label";
import { StatCard } from "@/components/brand/stat-card";
import { RevealOnScroll } from "@/components/brand/reveal-on-scroll";
import { SplitReveal } from "@/components/brand/split-reveal";
import { PROBLEM } from "@/lib/content/landing";

export function ProblemSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-6 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div>
          <RevealOnScroll>
            <SectionLabel className="mb-4">/ The problem</SectionLabel>
          </RevealOnScroll>
          <h2 className="text-balance font-display text-5xl leading-[1] tracking-[-0.025em] sm:text-7xl">
            <SplitReveal as="span" className="block">
              Most networking is
            </SplitReveal>
            <SplitReveal as="span" className="block italic text-coral" delay={0.1}>
              a polite catastrophe.
            </SplitReveal>
          </h2>
          <p className="mt-6 max-w-lg text-pretty text-lg text-ink/65">{PROBLEM.copy}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PROBLEM.stats.map((s, i) => (
            <RevealOnScroll key={s.label} delay={i * 0.06}>
              <StatCard value={s.value} label={s.label} fill={s.fill} square className="h-full rounded-3xl" />
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
