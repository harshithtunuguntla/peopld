import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

export type StackPerson = { id?: string | number; name: string; color: string };

type AvatarStackProps = {
  people: StackPerson[];
  size?: number;
  /** Show at most N, then a "+rest" chip. */
  max?: number;
  /** Ring color for the +rest chip border (matches surface). */
  chipClassName?: string;
  className?: string;
};

/** Overlapping row of avatars with an optional "+N" overflow chip. */
export function AvatarStack({
  people,
  size = 28,
  max,
  chipClassName = "bg-ink/10 text-ink",
  className,
}: AvatarStackProps) {
  const shown = max ? people.slice(0, max) : people;
  const rest = max ? people.length - shown.length : 0;
  return (
    <div className={cn("flex -space-x-2", className)}>
      {shown.map((p, i) => (
        <Avatar key={p.id ?? `${p.name}-${i}`} name={p.name} color={p.color} size={size} />
      ))}
      {rest > 0 && (
        <div
          className={cn("flex items-center justify-center rounded-full text-[10px] font-medium", chipClassName)}
          style={{ width: size, height: size }}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
