"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/organizer/console-ui";
import { COLORS } from "@/lib/design/colors";
import { isText, type QuestionResult } from "@/lib/feedback";

/**
 * One question's results, visualized the way mature form tools do (Google Forms /
 * Typeform): a **pie** for single-select + yes/no, **horizontal bars** for
 * checkboxes (multi-select), a **distribution column chart** for ratings, an **NPS
 * breakdown** (promoters / passives / detractors + score) for NPS, and a **list**
 * for free text. Self-contained + reusable; recharts is already in the console
 * bundle (analytics), so no new dependency.
 */

// Brand palette for categorical slices/bars (single source — lib/design/colors).
const SLICE = [COLORS.coral, COLORS.plasma, COLORS.ice, COLORS.gold, COLORS.chlorine, COLORS.sky, COLORS.amber, COLORS.rose];

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
} as const;

const AXIS_TICK = { fontSize: 12, fill: "hsl(var(--muted-foreground))" } as const;

export function QuestionResultCard({ q }: { q: QuestionResult }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base text-foreground">{q.label}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{q.answered} answered</span>
      </div>

      {q.answered === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No answers yet.</p>
      ) : (
        <div className="mt-4">
          <QuestionViz q={q} />
        </div>
      )}
    </Card>
  );
}

function QuestionViz({ q }: { q: QuestionResult }) {
  if (isText(q.type)) return <TextAnswers answers={q.text_answers} />;
  if (q.type === "nps") return <NpsBreakdown q={q} />;
  if (q.type === "rating") return <RatingDistribution q={q} />;
  if (q.type === "multi_choice") return <ChoiceBars q={q} />;
  // single_choice + yes_no
  return <ChoicePie q={q} />;
}

/* ----------------------------- choice: pie ----------------------------- */

function ChoicePie({ q }: { q: QuestionResult }) {
  const data = Object.entries(q.option_counts).map(([name, value]) => ({ name, value }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  if (data.length === 0) return <Empty />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={SLICE[i % SLICE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => {
                const n = Number(v);
                return [`${n} (${Math.round((n / total) * 100)}%)`, "responses"];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SLICE[data.indexOf(d) % SLICE.length] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-foreground">{d.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {d.value} · {Math.round((d.value / total) * 100)}%
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/* ----------------------------- multi: horizontal bars ----------------------------- */

function ChoiceBars({ q }: { q: QuestionResult }) {
  const data = Object.entries(q.option_counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  if (data.length === 0) return <Empty />;
  return (
    <div style={{ height: Math.max(data.length * 44, 88) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ----------------------------- rating: distribution columns ----------------------------- */

function RatingDistribution({ q }: { q: QuestionResult }) {
  const keys = Object.keys(q.option_counts)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const data = keys.map((k) => ({ name: `${k}★`, value: q.option_counts[String(k)] ?? 0 }));
  return (
    <>
      {q.average != null && (
        <p className="mb-3 font-display text-3xl text-accent">
          {q.average}
          <span className="ml-1 text-sm font-normal text-muted-foreground">avg</span>
        </p>
      )}
      {data.length === 0 ? (
        <Empty />
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

/* ----------------------------- nps: breakdown + distribution ----------------------------- */

function NpsBreakdown({ q }: { q: QuestionResult }) {
  let pro = 0;
  let pas = 0;
  let det = 0;
  let total = 0;
  for (const [k, v] of Object.entries(q.option_counts)) {
    const n = Number(k);
    if (Number.isNaN(n)) continue;
    total += v;
    if (n >= 9) pro += v;
    else if (n >= 7) pas += v;
    else det += v;
  }
  const score = total ? Math.round(((pro - det) / total) * 100) : 0;
  const data = Array.from({ length: 11 }, (_, i) => ({ name: String(i), value: q.option_counts[String(i)] ?? 0 }));

  const segs = [
    { label: "Promoters", n: pro, color: COLORS.chlorine },
    { label: "Passives", n: pas, color: COLORS.gold },
    { label: "Detractors", n: det, color: COLORS.coral },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="font-display text-3xl text-accent">
          {score}
          <span className="ml-1 text-sm font-normal text-muted-foreground">NPS</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {q.average != null && <>avg {q.average} · </>}
          {total} {total === 1 ? "rating" : "ratings"}
        </p>
      </div>

      {/* Promoter / passive / detractor split bar */}
      {total > 0 && (
        <>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {segs.map((s) => (
              <div key={s.label} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} aria-hidden />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {segs.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="text-foreground">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">{s.n}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((d) => {
                const n = Number(d.name);
                const color = n >= 9 ? COLORS.chlorine : n >= 7 ? COLORS.gold : COLORS.coral;
                return <Cell key={d.name} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ----------------------------- text: list ----------------------------- */

function TextAnswers({ answers }: { answers: string[] }) {
  if (answers.length === 0) return <Empty label="No written answers." />;
  return (
    <ul className="space-y-2">
      {answers.map((t, i) => (
        <li key={i} className="rounded-xl border border-border bg-background/40 px-3 py-2 text-sm text-foreground">
          {t}
        </li>
      ))}
    </ul>
  );
}

function Empty({ label = "No answers yet." }: { label?: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}
