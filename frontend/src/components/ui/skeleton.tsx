import { cn } from "@/lib/utils";

/**
 * Loading placeholder with a moving shimmer sweep (see `.skeleton` in
 * globals.css). Theme-aware and reduced-motion safe. Use it for any "still
 * loading" block instead of a bare `animate-pulse` rectangle.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}
