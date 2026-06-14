import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SplitReveal } from "@/components/brand/split-reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/design/colors";
import { ROUTES } from "@/lib/content/landing";

export function FinalCta() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-[1100px] px-6 sm:px-8">
        <div className="relative overflow-hidden rounded-[36px] bg-coral p-10 text-white sm:p-20">
          <div
            className="absolute -right-20 -top-20 h-72 w-72 animate-spin-slow rounded-full"
            style={{ background: COLORS.lime }}
            aria-hidden
          />
          <div
            className="absolute -bottom-10 -left-10 h-48 w-48 animate-spin-slow rounded-full [animation-direction:reverse]"
            style={{ background: COLORS.plasma }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="max-w-3xl text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] sm:text-7xl">
              <SplitReveal as="span" className="block">
                Run your next event like
              </SplitReveal>
              <SplitReveal as="span" className="block italic" delay={0.1}>
                someone obviously did this on purpose.
              </SplitReveal>
            </h2>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={ROUTES.host} className={cn(buttonVariants({ size: "lg" }))}>
                Host your first event free <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#experience"
                className={cn(buttonVariants({ size: "lg" }), "bg-white/15 text-white backdrop-blur hover:bg-white/25")}
              >
                See it live
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
