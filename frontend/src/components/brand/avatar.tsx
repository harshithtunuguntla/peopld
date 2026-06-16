"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { inkOn } from "@/lib/design/rounds";
import { avatarGradient } from "@/lib/design/avatar";

type AvatarProps = {
  name: string;
  /**
   * Solid brand hex (landing demo data). Foreground derived for contrast.
   * For real attendees prefer `seed` instead — it yields a multi-color gradient.
   */
  color?: string;
  /**
   * Stable identity (usually the attendee id). When provided and there's no
   * photo, the initials sit on a deterministic two-color brand gradient.
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
 * multi-color gradient, or `color` for a solid landing fill. */
export function Avatar({ name, color, seed, src, size = 36, ring = false, className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const showImage = src && !broken;
  // Gradient (real attendees) takes precedence; fall back to a solid color
  // (landing demo); finally derive a gradient from the name so we're never blank.
  const grad = seed ? avatarGradient(seed) : color ? null : avatarGradient(name);
  const background = grad ? grad.css : color;
  const fg = grad ? grad.ink : inkOn(color ?? "#000000");
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
