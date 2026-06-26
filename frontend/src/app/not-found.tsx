"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Root 404 — reachable from any unmatched route (marketing or app). Uses the
 * theme-aware app tokens so it reads correctly in both light and dark mode.
 * A single action takes the visitor back to where they came from (falling back
 * to home if there's no history to return to).
 */
export default function NotFound() {
  const router = useRouter();

  function goBack() {
    // history.length > 1 means there's a previous page in this tab to return to;
    // otherwise (deep-linked / fresh tab) fall back to the home hub.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/home");
    }
  }

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

      <div className="mt-7 flex items-center justify-center">
        <button type="button" onClick={goBack} className={cn(buttonVariants({ variant: "accent" }), "gap-2")}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Go back
        </button>
      </div>
    </main>
  );
}
