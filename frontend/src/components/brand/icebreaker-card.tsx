import { Sparkles, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type IcebreakerCardProps = {
  text: string;
  /** Eyebrow label (default "AI Icebreaker"). */
  label?: string;
  /** Wire up "Try another" — omit to hide the button. */
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
};

/**
 * The lime icebreaker card — an italic display quote with an optional
 * "Try another" action. Lives on dark attendee screens and the landing hero.
 */
export function IcebreakerCard({
  text,
  label = "AI Icebreaker",
  onRefresh,
  refreshing,
  className,
}: IcebreakerCardProps) {
  return (
    <div className={cn("rounded-[24px] bg-lime p-5 text-ink", className)}>
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] opacity-70">
        <Sparkles className="h-3 w-3" /> {label}
      </div>
      <p className="text-balance font-display text-[22px] italic leading-snug">&ldquo;{text}&rdquo;</p>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-3 flex items-center gap-1 rounded-full text-[11px] opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> {refreshing ? "Thinking…" : "Try another"}
        </button>
      )}
    </div>
  );
}
