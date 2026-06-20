"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Loader2, AlertTriangle, Search, Download, MapPin, X } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { defaultRoundName } from "@/lib/design/rounds";
import { cn } from "@/lib/utils";

interface RunSheetTable {
  table_number: number;
  people: string[];
}
interface RunSheetRound {
  round_number: number;
  theme: string | null;
  tables: RunSheetTable[];
}
interface RunSheet {
  event_name: string;
  basis: "arrived" | "registered";
  num_tables: number;
  seats_per_table: number;
  total_people: number;
  rounds: RunSheetRound[];
}

interface Spot {
  round: number;
  theme: string | null;
  table: number;
}

/**
 * Run sheet — an event-day operations console that also prints clean. On screen
 * it's searchable (find any attendee's table every round, jump between rounds);
 * for the day-of backup it still prints/PDFs as a plain white document if the app
 * falls over. Controls are hidden when printing.
 */
export default function RunSheetPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();

  const [sheet, setSheet] = useState<RunSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    apiFetch<RunSheet>(`/events/${eventId}/rounds/run-sheet`)
      .then(setSheet)
      .catch((e) =>
        setError(
          e instanceof ApiError && (e.status === 401 || e.status === 403)
            ? "You don't have access to this event."
            : e instanceof Error
              ? e.message
              : "Couldn't build the run sheet.",
        ),
      );
  }, [user, eventId]);

  // Attendee index: name → where they sit every round. Powers the lookup + the
  // in-document highlight.
  const index = useMemo(() => {
    const m = new Map<string, { display: string; spots: Spot[] }>();
    sheet?.rounds.forEach((rnd) =>
      rnd.tables.forEach((t) =>
        t.people.forEach((name) => {
          const key = name.toLowerCase();
          if (!m.has(key)) m.set(key, { display: name, spots: [] });
          m.get(key)!.spots.push({ round: rnd.round_number, theme: rnd.theme, table: t.table_number });
        }),
      ),
    );
    return m;
  }, [sheet]);

  const q = query.trim().toLowerCase();
  const matches = q ? [...index.values()].filter((p) => p.display.toLowerCase().includes(q)).sort((a, b) => a.display.localeCompare(b.display)) : [];
  const matchNames = new Set(matches.map((m) => m.display.toLowerCase()));

  function exportCsv() {
    if (!sheet) return;
    const rows: string[][] = [["Round", "Theme", "Table", "Person"]];
    sheet.rounds.forEach((r) =>
      r.tables.forEach((t) =>
        t.people.forEach((p) => rows.push([String(r.round_number), r.theme || defaultRoundName(r.round_number - 1), String(t.table_number), p])),
      ),
    );
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.event_name.replace(/[^\w-]+/g, "-")}-run-sheet.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!checked || (!sheet && !error)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  const hasRounds = !!sheet && sheet.rounds.length > 0;

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      {/* On-screen controls — hidden in print */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/organizer/event/${eventId}/live`}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Back to control room</span>
          </Link>
          {hasRounds && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                <Download className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                <Printer className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Print / PDF</span>
              </button>
            </div>
          )}
        </div>

        {hasRounds && (
          <div className="px-4 pb-3 sm:px-6">
            {/* Attendee lookup */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an attendee — see their table every round"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-9 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            {/* Lookup results */}
            {q && (
              <div className="mt-2 space-y-1.5">
                {matches.length === 0 ? (
                  <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-500">No attendee matches “{query}”.</p>
                ) : (
                  matches.slice(0, 6).map((p) => (
                    <div key={p.display} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <div className="text-sm font-semibold text-zinc-900">{p.display}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.spots
                          .sort((a, b) => a.round - b.round)
                          .map((s) => (
                            <a
                              key={s.round}
                              href={`#round-${s.round}`}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-zinc-200 transition-colors hover:ring-zinc-400"
                            >
                              <MapPin className="h-3 w-3 text-zinc-400" aria-hidden /> R{s.round} → Table {s.table}
                            </a>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Round jump nav */}
            {!q && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sheet!.rounds.map((r) => (
                  <a
                    key={r.round_number}
                    href={`#round-${r.round_number}`}
                    className="inline-flex items-center rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                  >
                    Round {r.round_number}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        {error ? (
          <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : sheet ? (
          <>
            <header className="mb-6 border-b border-zinc-200 pb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Seating run sheet · backup</p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{sheet.event_name}</h1>
              <p className="mt-2 text-sm text-zinc-600">
                {sheet.total_people} {sheet.total_people === 1 ? "person" : "people"} · {sheet.rounds.length}{" "}
                {sheet.rounds.length === 1 ? "round" : "rounds"} · {sheet.num_tables} tables of {sheet.seats_per_table}
              </p>
              <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
                {sheet.basis === "arrived"
                  ? "Built from the people checked in right now."
                  : "Built from the registered guest list (nobody checked in yet)."}{" "}
                It assumes these are the people who attend — re-print after check-in for the exact plan.
              </p>
            </header>

            {!hasRounds ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
                Not enough people to seat yet. Check people in (or wait for registrations), then refresh.
              </p>
            ) : (
              <div className="space-y-8">
                {sheet.rounds.map((rnd) => (
                  <section key={rnd.round_number} id={`round-${rnd.round_number}`} className="scroll-mt-44 break-inside-avoid">
                    <h2 className="mb-3 text-lg font-semibold">
                      Round {rnd.round_number}
                      <span className="ml-2 font-normal text-zinc-500">{rnd.theme || defaultRoundName(rnd.round_number - 1)}</span>
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {rnd.tables.map((t) => (
                        <div key={t.table_number} className="break-inside-avoid rounded-lg border border-zinc-300 p-3">
                          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500">Table {t.table_number}</div>
                          <ol className="space-y-0.5 text-sm">
                            {t.people.map((name, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-zinc-400">{i + 1}.</span>
                                <span className={cn(matchNames.has(name.toLowerCase()) && "rounded bg-amber-200 px-1 font-semibold text-amber-900")}>{name}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
