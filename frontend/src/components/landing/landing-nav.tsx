import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/content/landing";

/**
 * Minimal sticky landing header: mark + wordmark, Sign in, and the Book-a-demo
 * CTA. The old section-link nav (How it works / Experience / The night) was
 * removed to declutter; the page reads top-to-bottom without jump links.
 */
export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-ink/10 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between gap-3 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Logo />
          <span className="font-display text-2xl leading-none tracking-tight text-ink">Peopld</span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href={ROUTES.signIn}
            className="rounded-full px-3.5 py-2 text-[13px] font-medium text-ink/70 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </Link>
          <a href={ROUTES.bookDemo} className={cn(buttonVariants({ size: "sm" }), "h-10 px-5")}>
            Book a demo <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
