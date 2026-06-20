"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Flag, Users, Heart, Handshake, Trophy, Percent, BarChart3, ArrowRight, Share2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

import { apiFetch } from "@/lib/api";
import { Card } from "@/components/organizer/console-ui";
import { BentoTile, InfoHint } from "@/components/organizer/metric-tile";
import { Avatar } from "@/components/brand/avatar";
import { buttonVariants } from "@/components/ui/button";
import { roundFor } from "@/lib/design/rounds";
import { cn } from "@/lib/utils";

interface RoundPerf {
  round_number: number;
  seated: number;
  introductions: number;
}
interface TopConnector {
  attendee_id: string;
  name: string;
  count: number;
}
interface GraphNode {
  attendee_id: string;
  name: string;
  met: number;
  company?: string | null;
  role?: string | null;
  rounds_present?: number;
  mutual_likes?: number;
}
interface GraphEdge {
  a: string;
  b: string;
  matched: boolean;
  liked?: boolean;
  weight?: number;
  rounds?: number[];
}
// The relationship graph pulls in react-force-graph (canvas + d3-force), so it
// loads as its own client-only chunk — only when this recap actually renders.
const RelationshipGraph = dynamic(
  () => import("@/components/organizer/analytics/relationship-graph").then((m) => m.RelationshipGraph),
  { ssr: false, loading: () => <div className="h-[540px] skeleton rounded-2xl border border-border" /> },
);

interface Analytics {
  total_attendees: number;
  rounds_completed: number;
  avg_unique_people_met: number;
  total_likes: number;
  total_matches: number;
  liked_pairs: number;
  total_introductions: number;
  pct_room_met: number;
  seated_attendees: number;
  possible_introductions: number;
  min_people_met: number;
  round_performance: RoundPerf[];
  top_connectors: TopConnector[];
  graph_nodes: GraphNode[];
  graph_edges: GraphEdge[];
}

/**
 * Post-event recap — the "wrap" screen shown on the organizer's command center
 * (and the big screen for the room) once an event ends. Every number is real,
 * computed server-side from seatings + likes. Each metric carries an info hint so
 * the audience/organizer knows exactly what it means.
 */
export function EventRecap({ eventId }: { eventId: string }) {
  const [stats, setStats] = useState<Analytics | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    apiFetch<Analytics>(`/events/${eventId}/analytics`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoaded(true));
  }, [eventId]);

  // Match rate = share of conversations that became mutual connections.
  const matchRate =
    stats && stats.total_introductions > 0
      ? Math.round((stats.total_matches / stats.total_introductions) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
          <Flag className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-5 font-display text-[clamp(24px,4vw,38px)] leading-tight tracking-[-0.02em] text-foreground">
          That&apos;s a wrap{stats ? <> — the room sparked <em className="not-italic text-accent">{stats.total_introductions.toLocaleString()}</em> conversations</> : ""}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-balance text-sm text-muted-foreground">
          Rounds are closed and everyone&apos;s connections are unlocked. Here&apos;s the night by the numbers.
        </p>
      </div>

      {!loaded && <div className="h-40 skeleton rounded-2xl border border-border" />}

      {stats && (
        <>
          {/* Headline bento */}
          <HeadlineTiles stats={stats} matchRate={matchRate} />

          {/* How introductions converted + how much of the room we reached */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ from hello to connection</span>
                <InfoHint text="Of the pairs we sat together, how many showed interest (a heart), and how many became a mutual match." />
              </div>
              <IntroFunnel introductions={stats.total_introductions} liked={stats.liked_pairs} matches={stats.total_matches} />
            </Card>
            <CoverageCard
              made={stats.total_introductions}
              possible={stats.possible_introductions}
              minMet={stats.min_people_met}
              seated={stats.seated_attendees}
            />
          </div>

          {/* Secondary line */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric value={stats.total_attendees} label="attendees" />
            <Metric value={stats.rounds_completed} label={stats.rounds_completed === 1 ? "round" : "rounds"} />
            <Metric value={stats.avg_unique_people_met} label="avg new people / guest" info="Average number of distinct people each guest met across all rounds." />
            <Metric value={stats.total_likes} label="hearts sent" info="Total one-way likes guests sent each other (a mutual pair becomes a connection)." />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* New people met per round */}
            {stats.round_performance.length > 0 && (
              <Card className="p-5 sm:p-6">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ new conversations per round</span>
                  <InfoHint text="Fresh conversations created each round — pairs seated together who hadn't met before. (Room-wide pairs, not per person.) Shows the rounds doing their job." />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">New conversations created each round.</p>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.round_performance} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <XAxis
                        dataKey="round_number"
                        tickFormatter={(n) => `R${n}`}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        dy={6}
                      />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={36} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--accent) / 0.12)" }}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))", fontSize: 12 }}
                        labelFormatter={(n) => `Round ${n}`}
                        formatter={(v) => [v as number, "new conversations"]}
                      />
                      <Bar dataKey="introductions" radius={[8, 8, 0, 0]}>
                        {stats.round_performance.map((r, i) => (
                          <Cell key={r.round_number} fill={roundFor(i).bg} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Top connectors */}
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-accent">
                <Trophy className="h-3.5 w-3.5" aria-hidden /> / top connectors
                <InfoHint text="The guests who met the most distinct people across the night." />
              </div>
              {stats.top_connectors.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No connections recorded yet.</p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {stats.top_connectors.map((c, i) => (
                    <li key={c.attendee_id} className="flex items-center gap-3">
                      <span className="w-4 font-display text-base text-muted-foreground">{i + 1}</span>
                      <Avatar name={c.name} seed={c.attendee_id} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.name}</span>
                      <span className="font-display text-lg text-accent">{c.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* The room as a network — the signature exploration experience, last so
              it reads as a deep-dive rather than a mid-page chart. */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ explore the room</span>
              <InfoHint text="Every dot is a person; lines connect people we seated together. Thicker/amber lines met more than once; purple lines became mutual matches; node size = people met; colors are the natural groups that formed. Tap anyone to see their relationships." />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">A night of strangers, turned into a network. Tap any person to explore who they met, how often, and how strong each tie became.</p>
            <div className="mt-4">
              <RelationshipGraph nodes={stats.graph_nodes} edges={stats.graph_edges} />
            </div>
          </Card>
        </>
      )}

      <div className="pt-1 text-center">
        <a href={`/organizer/event/${eventId}/people`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
          <Users className="h-4 w-4" aria-hidden /> View attendees
        </a>
      </div>
    </div>
  );
}

/** The four headline numbers — shared by the full recap (analytics page) and the
 *  lean summary (live page ended state) so the metric language never drifts. */
function HeadlineTiles({ stats, matchRate }: { stats: Analytics; matchRate: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <BentoTile value={stats.total_introductions} label="conversations sparked" bg="#FF5A3C" fg="#fff" icon={Handshake}
        info="Unique pairs of people we seated together — every new conversation the seating engine created." />
      <BentoTile value={stats.total_matches} label="connections made" bg="#B66CFF" fg="#fff" icon={Heart}
        info="Mutual likes: both people liked each other and want to stay in touch." />
      <BentoTile value={`${stats.pct_room_met}%`} label="of the room met" bg="#A8D5FF" fg="#15130E" icon={Users}
        info="On average, each guest met this share of everyone else in the room." />
      <BentoTile value={`${matchRate}%`} label="match rate" bg="#D9FF4D" fg="#15130E" icon={Percent}
        info="Of all the conversations we created, this share turned into a mutual connection." />
    </div>
  );
}

/**
 * Lean post-event summary shown on the LIVE command center once an event ends.
 * Just the headline — the heavy intelligence (graph, funnel, relationship
 * analytics) lives on the dedicated /analytics page so the live route stays light.
 */
export function EventRecapSummary({ eventId }: { eventId: string }) {
  const [stats, setStats] = useState<Analytics | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    apiFetch<Analytics>(`/events/${eventId}/analytics`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoaded(true));
  }, [eventId]);

  const matchRate =
    stats && stats.total_introductions > 0
      ? Math.round((stats.total_matches / stats.total_introductions) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background/50 text-accent">
          <Flag className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-5 font-display text-[clamp(24px,4vw,38px)] leading-tight tracking-[-0.02em] text-foreground">
          That&apos;s a wrap{stats ? <> — the room sparked <em className="not-italic text-accent">{stats.total_introductions.toLocaleString()}</em> conversations</> : ""}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-balance text-sm text-muted-foreground">
          Rounds are closed and everyone&apos;s connections are unlocked. Here&apos;s the headline — open Analytics for the full relationship intelligence.
        </p>
      </div>

      {!loaded && <div className="h-32 skeleton rounded-2xl border border-border" />}

      {stats && (
        <>
          <HeadlineTiles stats={stats} matchRate={matchRate} />
          <div className="flex flex-col items-center justify-center gap-2 pt-2 sm:flex-row">
            <Link
              href={`/organizer/event/${eventId}/analytics`}
              className={cn(buttonVariants({ variant: "accent" }), "w-full gap-2 sm:w-auto")}
            >
              <BarChart3 className="h-4 w-4" aria-hidden /> View full analytics <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={`/organizer/event/${eventId}/people`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full gap-2 sm:w-auto")}
            >
              <Users className="h-4 w-4" aria-hidden /> View attendees
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ value, label, info }: { value: number; label: string; info?: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-background/40 p-4 text-center">
      {info && (
        <span className="absolute right-2 top-2">
          <InfoHint text={info} />
        </span>
      )}
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/** Sat together → sparked interest → matched. A true funnel (each stage ⊆ the one
 *  above), so the conversion line is always ≤ 100% — easy for anyone to read. */
function IntroFunnel({
  introductions,
  liked,
  matches,
}: {
  introductions: number;
  liked: number;
  matches: number;
}) {
  const max = Math.max(1, introductions, liked, matches);
  const stages = [
    { label: "Introductions", value: introductions, color: "#FF5A3C" },
    { label: "Sparked interest", value: liked, color: "#B66CFF" },
    { label: "Mutual matches", value: matches, color: "#D9FF4D" },
  ];
  const pct = (v: number, base: number) => (base > 0 ? Math.round((v / base) * 100) : 0);
  return (
    <div className="mt-4 space-y-3.5">
      {stages.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium text-foreground">{s.label}</span>
            <span className="font-display text-lg text-foreground">{s.value.toLocaleString()}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: s.color }} />
          </div>
          {i < stages.length - 1 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {pct(stages[i + 1].value, s.value)}% went on to {stages[i + 1].label.toLowerCase()}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Room coverage: how many of the possible pairs we actually introduced, plus the
 *  honest "nobody left behind" read (the fewest people anyone met). */
function CoverageCard({
  made,
  possible,
  minMet,
  seated,
}: {
  made: number;
  possible: number;
  minMet: number;
  seated: number;
}) {
  const pct = possible > 0 ? Math.round((made / possible) * 100) : 0;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ room coverage</span>
        <InfoHint text="Of every possible pair of people in the room, how many we actually introduced. 100% would mean everyone met everyone." />
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-4xl leading-none text-foreground">{pct}%</span>
        <span className="text-sm text-muted-foreground">of the room connected</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {made.toLocaleString()} of {possible.toLocaleString()} possible introductions made.
      </p>
      {seated > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-background/40 p-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p className="text-xs text-muted-foreground">
            {minMet > 0 ? (
              <>
                <span className="font-medium text-foreground">Nobody left behind</span> — everyone met at least {minMet} {minMet === 1 ? "person" : "people"}.
              </>
            ) : (
              <>At least one person wasn&apos;t seated with anyone — worth a personal intro next time.</>
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
