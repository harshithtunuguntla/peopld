"use client";

import { useMemo } from "react";
import { Heart, Repeat, Sparkles, Users, UserMinus, Crown, ShieldCheck, type LucideIcon } from "lucide-react";

import { Card } from "@/components/organizer/console-ui";
import { InfoHint } from "@/components/organizer/metric-tile";
import { Avatar } from "@/components/brand/avatar";
import { computeInsights, tierOf, COMMUNITY_COLORS, type GraphNode, type GraphEdge, type TierKey } from "./graph-utils";

const TIER_ICON: Record<TierKey, LucideIcon> = { matched: Heart, repeat: Repeat, spark: Sparkles, met: Users };

function SectionHead({ title, info }: { title: string; info: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ {title}</span>
      <InfoHint text={info} />
    </div>
  );
}

/**
 * The relationship-intelligence sections — the readable, decision-oriented
 * counterpart to the graph. Everything here is computed client-side from the same
 * weighted graph payload (no extra API call), so the graph and these panels always
 * agree. Each answers a specific organizer question.
 */
export function RelationshipInsights({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const ins = useMemo(() => computeInsights(nodes, edges), [nodes, edges]);
  if (nodes.length < 2) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Strongest relationships — who to celebrate / nurture */}
        <Card className="p-5 sm:p-6">
          <SectionHead
            title="strongest relationships"
            info="The bonds the night built — pairs who met repeatedly and/or matched. The strongest signal of value created (and the best candidates to reconnect at the next event)."
          />
          {ins.strongest.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No relationships recorded yet.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {ins.strongest.slice(0, 6).map((p) => {
                const t = tierOf(p);
                const Icon = TIER_ICON[t.key];
                return (
                  <li key={`${p.a}-${p.b}`} className="flex items-center gap-3">
                    <div className="flex shrink-0 -space-x-2">
                      <Avatar name={p.aName} seed={p.a} size={28} />
                      <Avatar name={p.bName} seed={p.b} size={28} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {p.aName} <span className="text-muted-foreground">&amp;</span> {p.bName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.weight > 1 ? `Met ${p.weight}× · ` : "Met once · "}
                        {p.rounds.length ? `R${p.rounds.join(", R")}` : ""}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${t.color}22`, color: t.color }}>
                      <Icon className="h-3 w-3" aria-hidden /> {t.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {ins.repeatPairs > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{ins.repeatPairs}</span> {ins.repeatPairs === 1 ? "pair" : "pairs"} were seated together more than once.
            </p>
          )}
        </Card>

        {/* Network health — who needs a hand / how evenly the room mixed */}
        <Card className="p-5 sm:p-6">
          <SectionHead
            title="network health"
            info="How evenly the room mixed, and who met the fewest people — the attendees worth a personal introduction so nobody leaves without a connection."
          />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <HealthStat value={ins.avgMet} label="avg met" />
            <HealthStat value={ins.medianMet} label="median" />
            <HealthStat value={ins.maxMet} label="most met" />
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <UserMinus className="h-3.5 w-3.5" aria-hidden /> Needs an intro
          </div>
          {ins.isolated.length === 0 ? (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-background/40 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Nobody left behind</span> — everyone met at least two people.
              </p>
            </div>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {ins.isolated.slice(0, 6).map((n) => (
                <li key={n.attendee_id} className="flex items-center gap-2.5">
                  <Avatar name={n.name} seed={n.attendee_id} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{n.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    met {n.met} {n.met === 1 ? "person" : "people"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Community insights — how the room naturally organized itself */}
      <Card className="p-5 sm:p-6">
        <SectionHead
          title="natural groups"
          info="Clusters the seating engine surfaced — people who circulated together form a group. Each group's 'connector' (the most-connected member) is a natural person to anchor a future table."
        />
        {ins.communities.length <= 1 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            The room mixed as one connected web — no separate clusters formed. That&apos;s a healthy sign the rounds spread people widely.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ins.communities.slice(0, 6).map((c, i) => {
              const color = COMMUNITY_COLORS[c.index % COMMUNITY_COLORS.length];
              return (
                <div key={c.index} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
                    <span className="text-sm font-medium text-foreground">Group {i + 1}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{c.members.length} people</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Avatar name={c.leader.name} seed={c.leader.attendee_id} size={26} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <Crown className="h-3 w-3" style={{ color }} aria-hidden /> connector
                      </div>
                      <div className="truncate text-sm text-foreground">{c.leader.name}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function HealthStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-2 py-2.5 text-center">
      <div className="font-display text-xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
