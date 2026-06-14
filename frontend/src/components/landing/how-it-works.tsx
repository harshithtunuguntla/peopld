import { ArrowUpRight } from "lucide-react";
import { SectionLabel } from "@/components/brand/section-label";
import { RevealOnScroll } from "@/components/brand/reveal-on-scroll";
import { SplitReveal } from "@/components/brand/split-reveal";
import { cn } from "@/lib/utils";
import { ACCENT_TEXT, FILL_BG } from "@/lib/design/palette";
import { STEPS } from "@/lib/content/landing";

export function HowItWorks() {
  return (
    <section id="how" className="bg-paper2 py-16 sm:py-24">
      <div className="mx-auto max-w-[1320px] px-6 sm:px-8">
        <div className="mb-14 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <RevealOnScroll>
              <SectionLabel className="mb-4">/ How it works</SectionLabel>
            </RevealOnScroll>
            <h2 className="text-balance font-display text-5xl leading-[1] tracking-[-0.025em] sm:text-6xl">
              <SplitReveal as="span" className="block">
                Three taps to a
              </SplitReveal>
              <SplitReveal as="span" className="block italic text-coral" delay={0.1}>
                full-room moment.
              </SplitReveal>
            </h2>
          </div>
          <p className="max-w-sm text-pretty text-ink/55">
            From plain-as-paper signup to a room of synchronized phones lighting up in unison.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <RevealOnScroll key={s.n} delay={i * 0.06}>
              <a
                href="#experience"
                className="group relative block h-full overflow-hidden rounded-3xl border border-ink/10 bg-white p-7 transition-all hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className={cn("absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-3xl transition group-hover:opacity-60", FILL_BG[s.accent])} aria-hidden />
                <div className="relative">
                  <div className={cn("mb-8 font-display text-6xl italic tracking-[-0.04em]", ACCENT_TEXT[s.accent])}>{s.n}</div>
                  <h3 className="mb-2 font-display text-2xl">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-ink/60">{s.desc}</p>
                  <div className="mt-6 flex items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-ink/45 transition-all group-hover:gap-3">
                    Preview scene <ArrowUpRight className="h-3 w-3" />
                  </div>
                </div>
              </a>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
