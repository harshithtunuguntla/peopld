"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

import { Card } from "@/components/organizer/console-ui";
import { InfoHint } from "@/components/organizer/metric-tile";
import type { GraphEdge } from "./graph-utils";

const NEW = "#FF5A3C"; // coral — a brand-new pairing
const REPEAT = "hsl(var(--muted-foreground))"; // muted — a pair who had already met

/** New vs repeat connections per round (ported from the Peopld Relationship
 *  Explorer reference). Each pair's earliest round is a NEW connection; every
 *  later round they share a table is a REPEAT — so the chart shows, round by
 *  round, how many fresh introductions vs. re-pairings happened. Hover for counts. */
function buildData(edges: GraphEdge[]) {
  const per = new Map<number, { round: number; neu: number; rep: number }>();
  for (const e of edges) {
    const rs = [...(e.rounds ?? [])].sort((a, b) => a - b);
    rs.forEach((r, i) => {
      const slot = per.get(r) ?? { round: r, neu: 0, rep: 0 };
      if (i === 0) slot.neu += 1;
      else slot.rep += 1;
      per.set(r, slot);
    });
  }
  return [...per.values()].sort((a, b) => a.round - b.round);
}

export function RoundConnectionsChart({ edges }: { edges: GraphEdge[] }) {
  const data = useMemo(() => buildData(edges), [edges]);
  if (data.length === 0) return null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ new vs repeat connections</span>
        <InfoHint text="A new connection is the first time a pair shares a table; a repeat is any later round the same pair meets again. Every unique pair is counted as new exactly once — they never double-count." />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Per round — fresh introductions vs. pairs who had already met. Each connection is a pair of people, so the count runs higher than the guest headcount.</p>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="round" tickFormatter={(n) => `R${n}`} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={36} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "hsl(var(--accent) / 0.1)" }}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))", fontSize: 12 }}
              labelFormatter={(n) => `Round ${n}`}
            />
            <Bar dataKey="neu" stackId="r" name="New" fill={NEW} />
            <Bar dataKey="rep" stackId="r" name="Repeat" fill={REPEAT} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEW }} /> New (first meeting)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground" /> Repeat (met before)</span>
      </div>
    </Card>
  );
}
