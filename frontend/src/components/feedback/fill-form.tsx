"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Check, User, EyeOff } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { AnswerField } from "@/components/feedback/answer-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type AnswerValue, type AttendeeForm, isAnswerEmpty } from "@/lib/feedback";

/**
 * Renders a published feedback form for an attendee to fill, validates required
 * questions client-side, and submits. Used both as the recap GATE (when the
 * organizer requires feedback first) and as the optional post-recap ask. Dark
 * attendee surface; mobile-first.
 */
export function FeedbackFillForm({
  eventId,
  form,
  onSubmitted,
  onSkip,
}: {
  eventId: string;
  form: AttendeeForm;
  onSubmitted: () => void;
  onSkip?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Per-question wrappers so we can scroll the first unanswered required one into
  // view — otherwise tapping Submit with an error below the fold looks like nothing.
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Lightweight progress so a long form doesn't feel bottomless.
  const { answered, totalRequired } = useMemo(() => {
    let a = 0;
    let req = 0;
    for (const q of form.questions) {
      if (q.required) req += 1;
      if (q.id && !isAnswerEmpty(answers[q.id])) a += 1;
    }
    return { answered: a, totalRequired: req };
  }, [form.questions, answers]);

  function setAnswer(id: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    setErrors((prev) => (prev[id] ? { ...prev, [id]: false } : prev));
  }

  async function submit() {
    const missing: Record<string, boolean> = {};
    for (const q of form.questions) {
      if (q.required && q.id && isAnswerEmpty(answers[q.id])) missing[q.id] = true;
    }
    if (Object.keys(missing).length) {
      setErrors(missing);
      setServerError(null);
      // Take the guest straight to the first thing they missed.
      const firstId = form.questions.find((q) => q.id && missing[q.id])?.id;
      if (firstId) {
        const el = fieldRefs.current[firstId];
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
      }
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const payload = form.questions
        .filter((q) => q.id && !isAnswerEmpty(answers[q.id!]))
        .map((q) => ({ question_id: q.id, value: answers[q.id!] }));
      await apiFetch(`/events/${eventId}/feedback-form/submit`, {
        method: "POST",
        body: JSON.stringify({ answers: payload }),
      });
      setDone(true);
      setTimeout(onSubmitted, 900);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't submit — try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-5 py-4 text-sm text-success">
        <Check className="h-4 w-4" aria-hidden /> Thanks for the feedback!
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-5 sm:p-6">
      <h2 className="font-display text-xl text-foreground">{form.title}</h2>
      {form.description && <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>}

      {/* Honest note about whether the organizer sees who answered. */}
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground">
        {form.collect_identity ? (
          <>
            <User className="h-3.5 w-3.5" aria-hidden /> Your name is shared with the organizer
          </>
        ) : (
          <>
            <EyeOff className="h-3.5 w-3.5" aria-hidden /> Responses are anonymous
          </>
        )}
      </p>

      <div className="mt-5 space-y-5">
        {form.questions.map((q) => (
          <div key={q.id} ref={(el) => { if (q.id) fieldRefs.current[q.id] = el; }}>
            <label className="block text-sm font-medium text-foreground">
              {q.label}
              {q.required && <span className="ml-1 text-accent">*</span>}
            </label>
            {q.help_text && <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{q.help_text}</p>}
            <div className={cn("mt-2", q.id && errors[q.id] && "rounded-xl ring-1 ring-destructive/50")}>
              <AnswerField question={q} value={q.id ? answers[q.id] : undefined} onChange={(v) => q.id && setAnswer(q.id, v)} />
            </div>
            {q.id && errors[q.id] && <p className="mt-1 text-xs text-destructive">This question is required.</p>}
          </div>
        ))}
      </div>

      {serverError && <p className="mt-4 text-sm text-destructive">{serverError}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        {onSkip ? (
          <button type="button" onClick={onSkip} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Skip
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {answered} of {form.questions.length} answered
            {totalRequired > 0 && <span className="text-accent"> · {totalRequired} required</span>}
          </span>
        )}
        <Button variant="accent" onClick={submit} disabled={busy} className="gap-1.5">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Submit feedback
        </Button>
      </div>
    </div>
  );
}
