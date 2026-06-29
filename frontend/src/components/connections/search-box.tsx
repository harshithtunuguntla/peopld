"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared people-search input. Pill style matching the existing filter chips, with
 * a clear button. Purely presentational — the parent owns the query state and runs
 * the generic `searchItems` engine over its own data.
 */
export function SearchBox({
  value,
  onChange,
  placeholder = "Search name, role, interest, bio…",
  ariaLabel = "Search people",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5", className)}>
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Wraps every occurrence of any search term in the text with a highlight, so a
 * result shows *why* it matched (e.g. "developer" inside a bio). Substring-aware
 * and case-insensitive; renders the text unchanged when there are no terms.
 */
export function Highlight({
  text,
  terms,
  className,
}: {
  text?: string | null;
  terms: string[];
  className?: string;
}) {
  if (!text) return null;
  const tokens = terms.filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "ig");
  const lower = new Set(tokens.map((t) => t.toLowerCase()));
  const parts = text.split(re);

  return (
    <>
      {parts.map((part, i) =>
        part && lower.has(part.toLowerCase()) ? (
          <mark key={i} className={cn("rounded bg-accent/25 px-0.5 text-accent", className)}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
