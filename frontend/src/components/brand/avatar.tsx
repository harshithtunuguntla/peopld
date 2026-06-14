import { cn } from "@/lib/utils";
import { inkOn } from "@/lib/design/rounds";

type AvatarProps = {
  name: string;
  /** Brand hex (from data). Foreground is derived for contrast. */
  color: string;
  /** Pixel diameter (default 36). */
  size?: number;
  /** Coral selection ring (e.g. "hearted"). */
  ring?: boolean;
  className?: string;
};

/** Initials avatar. Color comes from data; text contrast via `inkOn`. */
export function Avatar({ name, color, size = 36, ring = false, className }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        ring && "ring-2 ring-coral ring-offset-2 ring-offset-ink",
        className,
      )}
      style={{ width: size, height: size, background: color, color: inkOn(color), fontSize: size * 0.36 }}
      title={name}
      aria-hidden
    >
      {initials}
    </div>
  );
}
