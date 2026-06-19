import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Root 404 — reachable from any unmatched route (marketing or app). Uses the
 * theme-aware app tokens so it reads correctly in both light and dark mode.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <Link href="/" className="mb-10 flex items-center gap-2.5">
        <Logo size={34} />
        <span className="font-display text-2xl">Peopld</span>
      </Link>

      <div className="font-display leading-none tracking-[-0.04em] text-accent" style={{ fontSize: "clamp(90px,18vw,200px)" }}>
        404
      </div>
      <h1 className="mt-2 font-display text-[clamp(24px,3vw,38px)] tracking-[-0.02em]">
        This table <em className="italic text-accent">doesn&apos;t exist.</em>
      </h1>
      <p className="mt-2 max-w-sm text-balance text-muted-foreground">
        The page you&apos;re looking for was never seated. Let&apos;s get you back to the room.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/home" className={cn(buttonVariants({ variant: "accent" }), "gap-2")}>
          <Compass className="h-4 w-4" aria-hidden /> Go to my events
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back home
        </Link>
      </div>
    </main>
  );
}
