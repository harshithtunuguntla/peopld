import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Round } from "@/lib/design/rounds";
import { Avatar } from "./avatar";
import type { StackPerson } from "./avatar-stack";

type BoardingPassProps = {
  round: Round;
  tableNumber: string;
  seat?: string;
  location?: string;
  /** Show the dark icebreaker footer (default true). */
  showIcebreaker?: boolean;
  icebreaker?: string;
  tablemates?: StackPerson[];
  className?: string;
};

/**
 * Boarding pass for a table assignment — tuned for DARK app surfaces (ink-950
 * behind it). Round-colored header with a giant table number, a perforated
 * notch, and an optional dark icebreaker footer. The landing hero uses the
 * larger, light-context `HeroBoardingPass`. See DESIGN_SYSTEM §6.
 */
export function BoardingPass({
  round,
  tableNumber,
  seat = "3B",
  location = "By the window · near the bar",
  showIcebreaker = true,
  icebreaker,
  tablemates,
  className,
}: BoardingPassProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-black/20", className)}>
      {/* Header */}
      <div className="relative overflow-hidden p-5 pb-4" style={{ background: round.bg, color: round.ink }}>
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-20" style={{ background: round.ink }} />
        <div className="relative flex items-center justify-between text-[11px] uppercase tracking-[0.2em] opacity-80">
          <span>Boarding pass</span>
          <span>{round.name}</span>
        </div>
        <div className="relative mt-8 flex items-end justify-between">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.2em] opacity-75">Your table</div>
            <div className="font-display text-[120px] leading-[0.82] tracking-[-0.06em]">{tableNumber}</div>
          </div>
          {seat && (
            <div className="pb-2 text-right">
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-75">Seat</div>
              <div className="font-display text-3xl">{seat}</div>
            </div>
          )}
        </div>
        {location && <div className="relative mt-3 text-sm opacity-90">{location}</div>}
      </div>

      {/* Perforation */}
      <div className="relative h-3 bg-ink-900">
        <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-950" />
        <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-950" />
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-cream/15" />
      </div>

      {/* Icebreaker footer */}
      {showIcebreaker && icebreaker && (
        <div className="bg-ink-900 p-5 text-cream">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cream/50">
            <Sparkles className="h-3 w-3" style={{ color: round.bg }} /> Icebreaker
          </div>
          <p className="text-balance font-display text-lg italic leading-snug">&ldquo;{icebreaker}&rdquo;</p>
          {tablemates && tablemates.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              {tablemates.map((t) => (
                <Avatar key={t.id ?? t.name} name={t.name} color={t.color} size={22} />
              ))}
              <span className="text-xs text-cream/55">
                {tablemates.map((t) => t.name.split(" ")[0]).join(", ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
