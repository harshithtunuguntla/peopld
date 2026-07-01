"use client";

import { useEffect, useState } from "react";
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
import { Check, Copy, Loader2, Search, Sparkles, Lock } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Card } from "@/components/organizer/console-ui";
import { Pagination } from "@/components/ui/pagination";
import { COLORS } from "@/lib/design/colors";
import { AI_ENABLED } from "@/lib/features";
import { useDebouncedValue } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { isText, type QuestionResult } from "@/lib/feedback";

const TEXT_PAGE = 5; // free-text answers per page (fetched server-side)

interface TextAnswerEntry {
  text: string;
  name?: string | null;
  company?: string | null;
}
interface PagedText {
  items: TextAnswerEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One question's results, visualized the way mature form tools do (Google Forms /
 * Typeform): a **pie** for single-select + yes/no, **horizontal bars** for
 * checkboxes (multi-select), a **distribution column chart** for ratings, an **NPS
 * breakdown** (promoters / passives / detractors + score) for NPS, and a rich
 * **searchable, attributed list** for free text. Self-contained + reusable;
 * recharts is already in the console bundle (analytics), so no new dependency.
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

export function QuestionResultCard({
  q,
  eventId,
  responseCount = 0,
  reloadToken = 0,
}: {
  q: QuestionResult;
  /** Event id — text answers are fetched (paginated) per question from the API. */
  eventId: string;
  /** Total people who submitted the form — the denominator for skip rate. */
  responseCount?: number;
  /** Bumped by the header Refresh — re-pulls the current text-answer page. */
  reloadToken?: number;
}) {
  const skipped = responseCount > 0 ? Math.max(0, responseCount - q.answered) : 0;

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base text-foreground">{q.label}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {responseCount > 0 ? `${q.answered} of ${responseCount} answered` : `${q.answered} answered`}
          {skipped > 0 && <span className="text-warning"> · {skipped} skipped</span>}
        </span>
      </div>

      {q.answered === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No answers yet.</p>
      ) : (
        <div className="mt-4">
          {isText(q.type) ? (
            <TextAnswers eventId={eventId} questionId={q.question_id} answered={q.answered} reloadToken={reloadToken} />
          ) : (
            <QuestionViz q={q} />
          )}
        </div>
      )}
    </Card>
  );
}

function QuestionViz({ q }: { q: QuestionResult }) {
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

/* ----------------------------- text: searchable, attributed list ----------------------------- */

/**
 * Free-text answers for one question — fetched **page by page from the API** so a
 * question with thousands of written answers never ships them all to the browser.
 * Search runs server-side too, so it filters the whole set, not just a local page.
 */
function TextAnswers({ eventId, questionId, answered, reloadToken }: { eventId: string; questionId: string; answered: number; reloadToken: number }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedText | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const base = `/events/${eventId}/feedback-form/results/questions/${questionId}/answers`;

  // New search → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: String(TEXT_PAGE) });
    if (debounced) qs.set("q", debounced);
    apiFetch<PagedText>(`${base}?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ items: [], total: 0, page: 1, limit: TEXT_PAGE }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [base, page, debounced, reloadToken]);

  async function copyAll() {
    try {
      // Pull the whole (filtered) set just for the copy — an explicit action.
      const qs = new URLSearchParams({ page: "1", limit: "10000" });
      if (debounced) qs.set("q", debounced);
      const all = await apiFetch<PagedText>(`${base}?${qs}`);
      const text = all.items.map((e) => (e.name ? `${e.name}: ${e.text}` : `• ${e.text}`)).join("\n");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the CSV export is the fallback */
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TEXT_PAGE));
  const rangeStart = total === 0 ? 0 : (page - 1) * TEXT_PAGE + 1;
  const rangeEnd = Math.min(page * TEXT_PAGE, total);

  return (
    <div>
      <AiSummaryBeta count={answered} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${answered} answers…`}
            aria-label="Search written answers"
            className="h-9 w-full rounded-lg border border-border bg-background/50 pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/50"
          />
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading answers" />
        </div>
      ) : total === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {debounced ? `No answers match “${debounced}”.` : "No written answers."}
        </p>
      ) : (
        <>
          <ul className={cn("space-y-2 transition-opacity", loading && "opacity-60")}>
            {(data?.items ?? []).map((e, i) => (
              <TextItem key={`${rangeStart}-${i}`} entry={e} />
            ))}
          </ul>
          <Pagination
            className="mt-3"
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`Showing ${rangeStart}–${rangeEnd} of ${total}`}
          />
        </>
      )}
    </div>
  );
}

const CLAMP_AT = 240; // characters before we offer a "more" expansion

function TextItem({ entry }: { entry: TextAnswerEntry }) {
  const [open, setOpen] = useState(false);
  const long = entry.text.length > CLAMP_AT;
  const body = open || !long ? entry.text : entry.text.slice(0, CLAMP_AT).trimEnd() + "…";

  return (
    <li className="rounded-xl border border-border bg-background/40 px-3 py-2.5 text-sm">
      <p className="whitespace-pre-wrap break-words text-foreground">{body}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-accent hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
      {entry.name && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          — {entry.name}
          {entry.company && <span> · {entry.company}</span>}
        </p>
      )}
    </li>
  );
}

/* ----------------------------- AI summary (Beta, disabled) ----------------------------- */

/**
 * Themes & sentiment across written answers. The model isn't wired yet, so this
 * ships as a clearly-labelled, disabled **Beta** teaser. When AI_ENABLED flips on,
 * swap the disabled action for the real call — the surface is already designed in.
 */
function AiSummaryBeta({ count }: { count: number }) {
  return (
    <div className="mb-3 flex items-start gap-3 rounded-xl border border-dashed border-accent/30 bg-accent/[0.04] p-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Sparkles className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">AI summary</p>
          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Beta
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Automatic themes &amp; sentiment across {count} written {count === 1 ? "answer" : "answers"} — read the room in seconds.
        </p>
      </div>
      <button
        type="button"
        disabled={!AI_ENABLED}
        title={AI_ENABLED ? "Summarize answers" : "Coming soon"}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
          AI_ENABLED
            ? "border-accent/40 text-accent hover:bg-accent/10"
            : "cursor-not-allowed border-border text-muted-foreground opacity-70",
        )}
      >
        {!AI_ENABLED && <Lock className="h-3 w-3" aria-hidden />}
        {AI_ENABLED ? "Summarize" : "Soon"}
      </button>
    </div>
  );
}

function Empty({ label = "No answers yet." }: { label?: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}
