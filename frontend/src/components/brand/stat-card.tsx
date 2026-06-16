import { cn } from "@/lib/utils";
import { FILL_BG, FILL_FG, type Fill } from "@/lib/design/palette";

type StatCardProps = {
  value: string;
  label: string;
  sub?: string;
  fill: Fill;
  /** Use mono for time-like values. */
  mono?: boolean;
  /** Force a square tile (problem-section grid). */
  square?: boolean;
  className?: string;
};

/** A pastel metric tile (problem stats, recap, organizer). */
export function StatCard({ value, label, sub, fill, mono, square, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-2xl p-5",
        FILL_BG[fill],
        FILL_FG[fill],
        square && "aspect-square",
        className,
      )}
    >
      <div className={cn("font-display text-4xl tracking-[-0.03em] sm:text-5xl", mono && "font-mono")}>
        {value}
      </div>
      <div className="mt-2">
        <div className="text-sm leading-snug opacity-80">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] uppercase tracking-[0.18em] opacity-65">{sub}</div>}
      </div>
    </div>
  );
}
