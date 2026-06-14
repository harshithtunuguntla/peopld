import { MarqueeStrip } from "@/components/brand/marquee-strip";
import { LOGOS } from "@/lib/content/landing";

export function LogoStrip() {
  return (
    <section className="border-y border-ink/10 py-8">
      <MarqueeStrip items={LOGOS} />
    </section>
  );
}
