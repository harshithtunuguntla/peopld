"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable client-side pagination — a hook that slices an in-memory list, and a
 * mobile-first control to page through it. Used by the feedback responses (text
 * answers) and the cross-event rolodex. Purely presentational: it pages data the
 * client already has, so there's no extra fetch.
 */

export interface Pageable<T> {
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  total: number;
  pageItems: T[];
  rangeStart: number; // 1-based index of the first item on this page (0 when empty)
  rangeEnd: number; // 1-based index of the last item on this page
}

/**
 * @param items     the full, already-filtered list
 * @param pageSize  items per page
 * @param resetKey  when this changes (e.g. the search query), jump back to page 1
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey?: unknown): Pageable<T> {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // New filter/search → start at the top.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // Keep the current page valid as the list shrinks.
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    setPage,
    totalPages,
    total,
    pageItems: items.slice(start, start + pageSize),
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, total),
  };
}

/** First, last, current ±1, with ellipses for the gaps. */
function pageWindow(page: number, total: number): (number | "…")[] {
  const wanted = new Set([1, total, page, page - 1, page + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  summary,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  /** Optional "Showing 1–5 of 100" line shown alongside the control. */
  summary?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const go = (p: number) => onChange(Math.min(Math.max(1, p), totalPages));

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col items-center gap-2 sm:flex-row sm:justify-between", className)}
    >
      {summary && <p className="text-xs text-muted-foreground">{summary}</p>}

      <div className="flex items-center gap-1">
        <PageBtn label="Previous page" disabled={page === 1} onClick={() => go(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </PageBtn>

        {/* Compact on phones (just "X / Y"), numbered on wider screens. */}
        <span className="px-2 text-sm tabular-nums text-muted-foreground sm:hidden">
          {page} / {totalPages}
        </span>

        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "h-9 min-w-9 rounded-lg px-2 text-sm font-medium tabular-nums transition-colors",
                  p === page
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <PageBtn label="Next page" disabled={page === totalPages} onClick={() => go(page + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </PageBtn>
      </div>
    </nav>
  );
}

function PageBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  );
}
