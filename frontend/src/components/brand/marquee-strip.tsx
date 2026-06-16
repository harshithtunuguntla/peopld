import { cn } from "@/lib/utils";

type MarqueeStripProps = {
  items: string[];
  className?: string;
};

/** Looping logo/name strip with faded edges. CSS-only (`animate-marquee`),
 * paused for reduced-motion via the global media query. Light-context styling. */
export function MarqueeStrip({ items, className }: MarqueeStripProps) {
  return (
    <div className={cn("mask-fade-edges overflow-hidden", className)}>
      <div className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap sm:gap-14">
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className="font-display text-2xl italic text-ink/35 sm:text-3xl" aria-hidden={i >= items.length}>
            {item} <span className="text-coral/50">✕</span>
          </span>
        ))}
      </div>
    </div>
  );
}
