"use client";

import { useMemo } from "react";
import { Sparkles, Heart, Bookmark, UserCheck, TrendingUp, Users } from "lucide-react";

import type { Person } from "@/components/connections/person-card";
import { cn } from "@/lib/utils";

/**
 * Personal, flattering analytics for an attendee — "your night," not org funnels.
 * Computed entirely from the connections the page already loaded (no extra fetch,
 * no backend, no chart library — CSS bars keep the attendee bundle lean and the
 * render bulletproof on a phone). Safe to mount during the event (it grows as you
 * meet people) or after.
 */
export function AttendeeInsights({
  people,
  className,
  embedded = false,
}: {
  people: Person[];
  className?: string;
  /** Drop the outer card chrome + header (e.g. when wrapped in a collapsible that
   *  already provides the "Your insights" title). */
  embedded?: boolean;
}) {
  const ins = useMemo(() => computeInsights(people), [people]);
  if (ins.totalMet === 0) return null;

  return (
    <section className={cn(!embedded && "rounded-3xl border border-border bg-card/50 p-4 sm:p-5", className)}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="font-display text-lg text-foreground">Your insights</h2>
        </div>
      )}

      {ins.headline && (
        <p className={cn("text-sm leading-6 text-muted-foreground", !embedded && "mt-1.5")}>{ins.headline}</p>
      )}

      {/* Quick relationship summary */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <MiniStat icon={<Users className="h-4 w-4" />} value={ins.totalMet} label="met" />
        <MiniStat icon={<Heart className="h-4 w-4 fill-current" />} value={ins.matches} label="matches" accent={ins.matches > 0} />
        <MiniStat icon={<UserCheck className="h-4 w-4" />} value={ins.bothKeen} label="both keen" />
        <MiniStat icon={<Bookmark className="h-4 w-4" />} value={ins.saved} label="saved" />
      </div>

      {/* People met, round by round */}
      {ins.perRound.length > 0 && (
        <BarGroup
          title="People you met, round by round"
          rows={ins.perRound.map((r) => ({ label: `Round ${r.round}`, value: r.count }))}
        />
      )}

      {/* What you bonded over (shared interests) */}
      {ins.topShared.length > 0 && (
        <BarGroup
          title="What you bonded over"
          hint="Interests you shared with the people you met"
          rows={ins.topShared.map((t) => ({ label: t.tag, value: t.count }))}
          icon
        />
      )}
    </section>
  );
}

function MiniStat({ icon, value, label, accent }: { icon: React.ReactNode; value: number; label: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 text-center", accent ? "border-accent/40 bg-accent/10" : "border-border bg-background/40")}>
      <div className={cn("mx-auto mb-1 flex h-6 w-6 items-center justify-center", accent ? "text-accent" : "text-muted-foreground")}>
        {icon}
      </div>
      <div className="font-display text-xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/** A titled set of horizontal CSS bars, scaled to the largest value in the group. */
function BarGroup({
  title,
  hint,
  rows,
  icon,
}: {
  title: string;
  hint?: string;
  rows: { label: string; value: number }[];
  icon?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="mt-5">
      <p className="text-xs font-medium text-foreground">{title}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      <ul className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {icon && <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden />}
              <span className="truncate text-xs text-muted-foreground">{r.label}</span>
            </span>
            <span className="flex h-2.5 w-[55%] items-center sm:w-[60%]" aria-hidden>
              <span
                className="h-2.5 rounded-full bg-gradient-to-r from-accent/70 to-accent"
                style={{ width: `${Math.max((r.value / max) * 100, 6)}%` }}
              />
            </span>
            <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Insights {
  totalMet: number;
  matches: number;
  bothKeen: number;
  saved: number;
  perRound: { round: number; count: number }[];
  topShared: { tag: string; count: number }[];
  headline: string | null;
}

/** Derive personal insights from the grouped connection list. Pure + defensive. */
function computeInsights(people: Person[]): Insights {
  const met = people.filter((p) => p.met);
  const totalMet = met.length;
  const matches = people.filter((p) => p.mutual).length;
  const bothKeen = people.filter((p) => p.wanted && p.wants_me).length;
  const saved = people.filter((p) => p.saved).length;

  // People per round (a person met across two rounds counts in each — it reflects
  // who was at your table that round).
  const roundCounts = new Map<number, number>();
  for (const p of met) {
    for (const r of p.rounds) {
      if (r > 0) roundCounts.set(r, (roundCounts.get(r) ?? 0) + 1);
    }
  }
  const perRound = [...roundCounts.entries()]
    .map(([round, count]) => ({ round, count }))
    .sort((a, b) => a.round - b.round);

  // What you bonded over — tally shared interests across everyone you met.
  const sharedCounts = new Map<string, number>();
  for (const p of met) {
    for (const tag of p.shared_interests ?? []) {
      const key = tag.trim();
      if (key) sharedCounts.set(key, (sharedCounts.get(key) ?? 0) + 1);
    }
  }
  const topShared = [...sharedCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 6);

  // A warm one-liner: lead with matches, else the strongest shared theme, else met.
  let headline: string | null = null;
  if (matches > 0) {
    headline = `You matched with ${matches} ${matches === 1 ? "person" : "people"} — out of ${totalMet} you met.`;
  } else if (topShared.length > 0 && topShared[0].count > 1) {
    headline = `You met ${totalMet} ${totalMet === 1 ? "person" : "people"}, bonding most over ${topShared[0].tag}.`;
  } else {
    headline = `You met ${totalMet} ${totalMet === 1 ? "person" : "people"} across ${perRound.length || 1} ${perRound.length === 1 ? "round" : "rounds"}.`;
  }

  return { totalMet, matches, bothKeen, saved, perRound, topShared, headline };
}
