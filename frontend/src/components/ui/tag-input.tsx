"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Quick-add chips shown below the field. */
  suggestions?: string[];
  placeholder?: string;
  /** Cap the number of tags (default 8). */
  max?: number;
  id?: string;
  "aria-describedby"?: string;
}

/**
 * Chip-style tag entry. Type + Enter (or comma) to add, click ✕ or Backspace to
 * remove, tap a suggestion to quick-add. Token-driven, so it works on the dark
 * attendee surfaces. Used for interests at registration + profile editing.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter…",
  max = 8,
  id,
  "aria-describedby": describedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const atMax = value.length >= max;

  function add(raw: string) {
    const t = raw.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!t || atMax) return;
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) return; // de-dupe
    onChange([...value, t]);
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      removeAt(value.length - 1);
    }
  }

  const remainingSuggestions = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div>
      <div
        className={cn(
          "flex min-h-12 w-full flex-wrap items-center gap-1.5 rounded-xl border border-input bg-secondary/50 px-2.5 py-2",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        )}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 py-1 pl-3 pr-1.5 text-sm font-medium text-accent"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`Remove ${tag}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-accent/70 transition-colors hover:bg-accent/20 hover:text-accent"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-describedby={describedBy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          disabled={atMax}
          placeholder={atMax ? `Up to ${max} tags` : value.length ? "" : placeholder}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {remainingSuggestions.length > 0 && !atMax && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remainingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
            >
              <Plus className="h-3 w-3" aria-hidden /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sensible default interest chips for a founder/networking event. */
export const INTEREST_SUGGESTIONS = [
  "AI",
  "Climate",
  "Fintech",
  "SaaS",
  "Design",
  "Hiring",
  "Fundraising",
  "Web3",
  "Healthcare",
  "Marketing",
];
