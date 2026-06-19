"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ChevronLeft } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error boundary for the whole organizer console (Next.js route-segment
 * convention). If any console screen throws while rendering — most critically the
 * live command center during an event — this shows a recoverable fallback with a
 * one-tap retry instead of a white screen. The event data itself is untouched;
 * `reset()` re-renders the segment.
 */
export default function OrganizerConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it for debugging; the digest correlates with server logs.
    console.error("Organizer console error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-2xl">Something went wrong</h1>
      <p className="max-w-sm text-balance text-sm text-muted-foreground">
        The console hit an unexpected error. Your event and everyone&apos;s data are safe — try again.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button variant="accent" size="lg" onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
        <a href="/organizer/dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-1.5")}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to dashboard
        </a>
      </div>
    </div>
  );
}
