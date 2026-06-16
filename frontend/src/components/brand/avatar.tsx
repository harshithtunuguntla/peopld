"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { inkOn } from "@/lib/design/rounds";
import { avatarColor } from "@/lib/design/avatar";

type AvatarProps = {
  name: string;
  /**
   * Solid brand hex (landing demo data). Foreground derived for contrast.
   * For real attendees prefer `seed` instead — it picks a stable brand color.
   */
  color?: string;
  /**
   * Stable identity (usually the attendee id). When provided and there's no
   * photo, the initials sit on a deterministic single brand color.
   */
  seed?: string;
  /** Optional profile photo (e.g. Google). Falls back to initials if absent/broken. */
  src?: string | null;
  /** Pixel diameter (default 36). */
  size?: number;
  /** Coral selection ring (e.g. "hearted"). */
  ring?: boolean;
  className?: string;
};

/** Initials avatar, or a profile photo when `src` is provided (with graceful
 * fallback to initials if the image fails to load). Pass `seed` for a stable
 * single brand color, or `color` for an explicit landing fill. */
export function Avatar({ name, color, seed, src, size = 36, ring = false, className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const showImage = src && !broken;
  // A seeded solid brand color (real attendees) takes precedence; fall back to an
  // explicit landing `color`; finally derive one from the name so we're never blank.
  const swatch = seed ? avatarColor(seed) : color ? null : avatarColor(name);
  const background = swatch ? swatch.css : color;
  const fg = swatch ? swatch.ink : inkOn(color ?? "#000000");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        ring && "ring-2 ring-coral ring-offset-2 ring-offset-ink",
        className,
      )}
      style={{ width: size, height: size, background, color: fg, fontSize: size * 0.36 }}
      title={name}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}
