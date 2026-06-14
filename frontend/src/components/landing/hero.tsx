import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { SplitReveal } from "@/components/brand/split-reveal";
import { CountUp } from "@/components/brand/count-up";
import { HeroBoardingPass } from "@/components/brand/hero-boarding-pass";
import { AIGiftCard } from "@/components/brand/ai-gift-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { roundFor } from "@/lib/design/rounds";
import { COLORS } from "@/lib/design/colors";
import { HERO, ATTENDEES, ROUTES } from "@/lib/content/landing";

const heroRound = roundFor(0);
const tablemates = ATTENDEES.slice(0, 3);

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-12 sm:pt-32 sm:pb-20">
      {/* faint horizontal rules */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `linear-gradient(${COLORS.ink}06 1px, transparent 1px)`, backgroundSize: "100% 110px" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          {/* COPY — first on mobile (headline-first), left on desktop */}
          <div className="order-1">
            <h1 className="text-balance font-display text-[clamp(36px,5.4vw,76px)] leading-[0.95] tracking-[-0.035em]">
              <SplitReveal as="span" className="block" trigger={false} delay={0.1}>
                The room
              </SplitReveal>
              <SplitReveal as="span" className="block" trigger={false} delay={0.25}>
                already knows
              </SplitReveal>
              <SplitReveal as="span" className="block italic text-coral" trigger={false} delay={0.4}>
                who you should meet.
              </SplitReveal>
            </h1>

            <p className="mt-6 max-w-xl text-[clamp(15px,1.15vw,18px)] leading-relaxed text-ink/65">{HERO.subcopy}</p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Link href={ROUTES.host} className={cn(buttonVariants({ size: "lg" }), "hover:-translate-y-0.5")}>
                Host an event <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#experience" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
                See it live <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-4 text-sm text-ink/55">
              <div className="flex -space-x-2">
                {ATTENDEES.slice(0, 5).map((a) => (
                  <span
                    key={a.id}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ background: a.color, color: COLORS.ink, boxShadow: `0 0 0 2px ${COLORS.paper}` }}
                  >
                    {a.name[0]}
                  </span>
                ))}
              </div>
              <span>
                <CountUp to={HERO.proofCount} className="font-semibold text-ink" />
                {HERO.proofSuffix}
              </span>
            </div>
          </div>

          {/* ARTWORK — second on mobile, right on desktop */}
          <div className="relative order-2">
            <div className="relative mx-auto w-[82%] max-w-[360px] sm:w-[70%] lg:mx-0 lg:ml-auto lg:mt-3">
              {/* AI gift card peeks out from behind, left (less on mobile so it stays on-screen) */}
              <div className="absolute -left-[12%] top-[20%] z-0 w-[56%] max-w-[220px] sm:-left-[22%] lg:-left-[28%]">
                <AIGiftCard text={HERO.giftIcebreaker} meta={HERO.giftMeta} tilt={-10} delay={0.55} />
              </div>
              {/* main boarding pass */}
              <div className="relative z-10">
                <HeroBoardingPass
                  round={heroRound}
                  tableNumber="07"
                  seat="3B"
                  location="By the window, near the bar"
                  icebreaker={HERO.passIcebreaker}
                  tablemates={tablemates}
                  roundLabel="Round 1"
                  tilt={5}
                />
              </div>
              {/* floating "your table" chip */}
              <div
                className="absolute -bottom-5 -right-2 z-20 flex items-center gap-3 rounded-2xl border border-ink/10 bg-white p-3 shadow-xl sm:-right-6"
                aria-hidden
              >
                <div className="flex -space-x-1.5">
                  {ATTENDEES.slice(0, 4).map((a) => (
                    <span
                      key={a.id}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{ background: a.color, color: COLORS.ink, boxShadow: "0 0 0 2px white" }}
                    >
                      {a.name[0]}
                    </span>
                  ))}
                </div>
                <div className="pr-2">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-ink/45">Your table</div>
                  <div className="text-sm font-medium">Maya, Jordan, Priya + you</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
