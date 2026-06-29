"use client";

import { Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AnswerValue, FormQuestion } from "@/lib/feedback";

/**
 * Renders the answer control for one feedback question. Shared by the attendee
 * fill flow (interactive) and the organizer builder (a disabled live preview), so
 * "what you build" is exactly "what they answer". Token-driven → works on the dark
 * attendee surface and the light organizer surface unchanged.
 */
export function AnswerField({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: FormQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  disabled?: boolean;
}) {
  const q = question;

  if (q.type === "short_text") {
    return (
      <Input
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={500}
        placeholder="Your answer"
      />
    );
  }

  if (q.type === "long_text") {
    return (
      <Textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        maxLength={2000}
        placeholder="Your answer"
      />
    );
  }

  if (q.type === "yes_no") {
    return (
      <div className="flex gap-2">
        {["Yes", "No"].map((opt) => (
          <ChoiceChip key={opt} label={opt} selected={value === opt} disabled={disabled} onClick={() => onChange(opt)} />
        ))}
      </div>
    );
  }

  if (q.type === "single_choice") {
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((opt) => (
          <ChoiceRow
            key={opt}
            label={opt}
            kind="radio"
            selected={value === opt}
            disabled={disabled}
            onClick={() => onChange(opt)}
          />
        ))}
      </div>
    );
  }

  if (q.type === "multi_choice") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((opt) => {
          const on = arr.includes(opt);
          return (
            <ChoiceRow
              key={opt}
              label={opt}
              kind="check"
              selected={on}
              disabled={disabled}
              onClick={() => onChange(on ? arr.filter((o) => o !== opt) : [...arr, opt])}
            />
          );
        })}
      </div>
    );
  }

  if (q.type === "rating") {
    const current = typeof value === "number" ? value : 0;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {Array.from({ length: q.scale }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-label={`${n} of ${q.scale}`}
            aria-pressed={current === n}
            className="p-1 text-muted-foreground transition-colors hover:text-accent disabled:opacity-60"
          >
            <Star className={cn("h-7 w-7", current >= n && "fill-accent text-accent")} aria-hidden />
          </button>
        ))}
      </div>
    );
  }

  // nps: 0–10 scale
  const current = typeof value === "number" ? value : null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 11 }, (_, i) => i).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-pressed={current === n}
          className={cn(
            "h-10 w-10 shrink-0 rounded-xl border text-sm font-medium tabular-nums transition-colors disabled:opacity-60",
            current === n
              ? "border-transparent bg-accent text-accent-foreground"
              : "border-border bg-card text-foreground hover:border-accent/50",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ChoiceChip({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-11 flex-1 rounded-xl border text-sm font-medium transition-colors disabled:opacity-60",
        selected ? "border-transparent bg-accent text-accent-foreground" : "border-border bg-card text-foreground hover:border-accent/50",
      )}
    >
      {label}
    </button>
  );
}

function ChoiceRow({
  label,
  kind,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  kind: "radio" | "check";
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors disabled:opacity-60",
        selected ? "border-accent bg-accent/10 text-foreground" : "border-border bg-card text-foreground hover:border-accent/50",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors",
          kind === "radio" ? "rounded-full" : "rounded-md",
          selected ? "border-accent bg-accent" : "border-line-strong",
        )}
        aria-hidden
      >
        {selected && (kind === "radio" ? <span className="h-2 w-2 rounded-full bg-accent-foreground" /> : <span className="text-[11px] font-bold leading-none text-accent-foreground">✓</span>)}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}
