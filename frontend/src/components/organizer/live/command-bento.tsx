"use client";

import { motion } from "framer-motion";
import { Users, Armchair, Heart, Sparkles, Radio, type LucideIcon } from "lucide-react";

import { Card } from "@/components/organizer/console-ui";
import { cn } from "@/lib/utils";
import type { LiveStats, Phase } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The live command center's headline — a premium bento that leads with the one
 * number that matters during an event (how much of the room is actually here and
 * seated) and supports it with the live pulse. Replaces the flat 4-card row:
 * clear primary-vs-secondary hierarchy, real progress, mobile-first.
 */
export function CommandBento({
  stats,
  arrivedFallback,
  seatableCount,
  phaseKind,
}: {
  stats: LiveStats | null;
  arrivedFallback: number;
  seatableCount: number;
  phaseKind: Phase["kind"];
}) {
  const arrived = stats?.arrived ?? arrivedFallback;
  const registered = Math.max(stats?.registered ?? arrived, arrived);
  const isActive = phaseKind === "active";
  const seatedNow = stats?.seated_now ?? 0;
  const participation = registered > 0 ? Math.round((arrived / registered) * 100) : 0;

  const seatingValue = isActive ? seatedNow : seatableCount;
  const seatingLabel = isActive ? "Seated now" : "Ready to seat";
  const roundValue = isActive && stats?.active_round_number ? `R${stats.active_round_number}` : `${stats?.rounds_completed ?? 0}`;
  const roundLabel = isActive && stats?.active_round_number ? "Live round" : "Rounds done";

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Primary: participation — the headline of a live room. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="col-span-2 flex flex-col justify-between overflow-hidden rounded-3xl bg-accent p-5 text-accent-foreground sm:row-span-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/10">
            <Users className="h-4 w-4" aria-hidden />
          </div>
          <span className="rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold tabular-nums">{participation}% in</span>
        </div>
        <div className="mt-6">
          <div className="font-display text-[clamp(40px,9vw,64px)] leading-none tracking-[-0.04em] tabular-nums">
            {arrived}
            <span className="text-[0.42em] font-medium opacity-70"> / {registered}</span>
          </div>
          <div className="mt-1.5 text-sm font-medium opacity-85">checked in</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/15">
            <motion.div
              className="h-full rounded-full bg-accent-foreground/90"
              initial={{ width: 0 }}
              animate={{ width: `${participation}%` }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
            />
          </div>
        </div>
      </motion.div>

      <Tile icon={Armchair} value={seatingValue} label={seatingLabel} delay={0.05} highlight={isActive} />
      <Tile icon={Radio} value={roundValue} label={roundLabel} delay={0.1} />
      <Tile icon={Heart} value={stats?.likes_count ?? 0} label="Hearts sent" delay={0.15} />
      <Tile icon={Sparkles} value={stats?.matches_count ?? 0} label="Matches" delay={0.2} />
    </div>
  );
}

function Tile({
  icon: Icon,
  value,
  label,
  delay = 0,
  highlight = false,
}: {
  icon: LucideIcon;
  value: number | string;
  label: string;
  delay?: number;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
    >
      <Card className={cn("flex h-full flex-col justify-between p-4 sm:p-5", highlight && "ring-1 ring-accent/40")}>
        <div className="flex items-center justify-between">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", highlight ? "bg-accent/15 text-accent" : "bg-accent/10 text-accent")}>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          {highlight && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />}
        </div>
        <div>
          <div className="mt-3 font-display text-[28px] leading-none tracking-[-0.03em] tabular-nums text-foreground">{value}</div>
          <div className="mt-1.5 text-xs text-muted-foreground sm:text-sm">{label}</div>
        </div>
      </Card>
    </motion.div>
  );
}
