"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Loader2, AlertTriangle } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { defaultRoundName } from "@/lib/design/rounds";

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

/**
 * Printable event-day backup. A clean white "document" (fixed light colors so it
 * prints well from either theme) listing every round's tables and who sits where.
 * If the app falls over mid-event, the organizer prints/PDFs this and the night
 * keeps running. On-screen controls are hidden when printing.
 */
export default function RunSheetPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();

  const [sheet, setSheet] = useState<RunSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!checked || (!sheet && !error)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      {/* On-screen controls — hidden in print */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur print:hidden sm:px-6">
        <Link
          href={`/organizer/event/${eventId}/live`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to control room
        </Link>
        {sheet && sheet.rounds.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print / Save as PDF
          </button>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
                Seating run sheet · backup
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{sheet.event_name}</h1>
              <p className="mt-2 text-sm text-zinc-600">
                {sheet.total_people} {sheet.total_people === 1 ? "person" : "people"} ·{" "}
                {sheet.rounds.length} {sheet.rounds.length === 1 ? "round" : "rounds"} ·{" "}
                {sheet.num_tables} tables of {sheet.seats_per_table}
              </p>
              <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
                {sheet.basis === "arrived"
                  ? "Built from the people checked in right now."
                  : "Built from the registered guest list (nobody checked in yet)."}{" "}
                It assumes these are the people who attend — re-print after check-in for the exact plan.
              </p>
            </header>

            {sheet.rounds.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
                Not enough people to seat yet. Check people in (or wait for registrations), then refresh.
              </p>
            ) : (
              <div className="space-y-8">
                {sheet.rounds.map((rnd) => (
                  <section key={rnd.round_number} className="break-inside-avoid">
                    <h2 className="mb-3 text-lg font-semibold">
                      Round {rnd.round_number}
                      <span className="ml-2 font-normal text-zinc-500">
                        {rnd.theme || defaultRoundName(rnd.round_number - 1)}
                      </span>
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {rnd.tables.map((t) => (
                        <div key={t.table_number} className="break-inside-avoid rounded-lg border border-zinc-300 p-3">
                          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500">
                            Table {t.table_number}
                          </div>
                          <ol className="space-y-0.5 text-sm">
                            {t.people.map((name, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-zinc-400">{i + 1}.</span>
                                <span>{name}</span>
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
