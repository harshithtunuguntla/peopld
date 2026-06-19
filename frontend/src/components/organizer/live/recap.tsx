"use client";

import { useEffect, useState } from "react";
import { Flag, Users, Heart, Handshake, Trophy, Percent } from "lucide-react";
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
interface Analytics {
  total_attendees: number;
  rounds_completed: number;
  avg_unique_people_met: number;
  total_likes: number;
  total_matches: number;
  total_introductions: number;
  pct_room_met: number;
  round_performance: RoundPerf[];
  top_connectors: TopConnector[];
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
                  <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent">/ new people met per round</span>
                  <InfoHint text="Fresh introductions created in each round — pairs who hadn't met before. Shows the rounds doing their job." />
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
                        formatter={(v) => [v as number, "new people"]}
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
