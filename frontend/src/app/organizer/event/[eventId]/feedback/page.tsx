"use client";

import { use, useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  Loader2,
  Eye,
  Send,
  Download,
  MessageSquareText,
  Lock,
  User,
  ChevronLeft,
  ChevronRight,
  EyeOff,
} from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { ConsoleGate } from "@/components/organizer/console-ui";
import { Card } from "@/components/organizer/console-ui";
import { Segmented, Toggle } from "@/components/organizer/console-ui";
import { EventHeader, EventAccessError } from "@/components/organizer/event-header";
import { type EventInfo } from "@/components/organizer/live/types";
import { AnswerField } from "@/components/feedback/answer-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import {
  type FormConfig,
  type FormQuestion,
  type FormResults,
  type IndividualResponse,
  type QuestionType,
  QUESTION_TYPE_META,
  blankQuestion,
  formatAnswer,
  isChoice,
  isText,
  typeLabel,
} from "@/lib/feedback";

/**
 * Custom feedback-form builder + responses — a dedicated page (not a modal) so the
 * organizer has room to design the form. Build view = a Google-Forms-style editor
 * with our design system; Responses view = aggregated results. Owner-only, same
 * gating as the rest of the console. Mobile + laptop.
 */
export default function FeedbackPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user, checked } = useOrganizer();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [denied, setDenied] = useState<null | "forbidden" | "missing">(null);
  const [view, setView] = useState<"build" | "responses">("build");

  useEffect(() => {
    if (!user) return;
    apiFetch<EventInfo>(`/events/${eventId}`)
      .then(setEvent)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setDenied("forbidden");
        else if (e instanceof ApiError && e.status === 404) setDenied("missing");
      });
  }, [user, eventId]);

  if (!checked || !user) return <ConsoleGate />;

  if (denied) {
    return (
      <ConsoleShell>
        <EventHeader eventId={eventId} active="feedback" />
        <EventAccessError notFound={denied === "missing"} />
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell>
      <EventHeader eventId={eventId} name={event?.name} status={event?.status} active="feedback" />
      <div className="mb-6">
        <Segmented<"build" | "responses">
          value={view}
          onChange={setView}
          options={[
            { value: "build", label: "Build" },
            { value: "responses", label: "Responses" },
          ]}
        />
      </div>
      {view === "build" ? <BuildView eventId={eventId} /> : <ResponsesView eventId={eventId} />}
    </ConsoleShell>
  );
}

/* ============================== Build view ============================== */

function BuildView({ eventId }: { eventId: string }) {
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch<FormConfig>(`/events/${eventId}/feedback-form`)
      .then((c) => setConfig({ ...c, questions: c.questions ?? [] }))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the form"));
  }, [eventId]);

  const patch = useCallback((p: Partial<FormConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
    setSavedTick(false);
  }, []);

  const setQuestions = useCallback(
    (fn: (qs: FormQuestion[]) => FormQuestion[]) => {
      setConfig((prev) => (prev ? { ...prev, questions: fn(prev.questions) } : prev));
      setDirty(true);
      setSavedTick(false);
    },
    [],
  );

  function addQuestion(type: QuestionType) {
    setQuestions((qs) => [...qs, blankQuestion(type)]);
    setAdding(false);
  }

  function clientValidate(c: FormConfig): string | null {
    if (!c.title.trim()) return "Give the form a title.";
    if (c.questions.length === 0) return "Add at least one question.";
    for (const q of c.questions) {
      if (!q.label.trim()) return "Every question needs a label.";
      if (isChoice(q.type) && q.options.filter((o) => o.trim()).length < 2)
        return `“${q.label || "A choice question"}” needs at least two options.`;
    }
    return null;
  }

  const save = useCallback(async (): Promise<FormConfig | null> => {
    if (!config) return null;
    const problem = clientValidate(config);
    if (problem) {
      setError(problem);
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await apiFetch<FormConfig>(`/events/${eventId}/feedback-form`, {
        method: "PUT",
        body: JSON.stringify({
          title: config.title,
          description: config.description || null,
          gate_recap: config.gate_recap,
          collect_identity: config.collect_identity,
          questions: config.questions,
        }),
      });
      setConfig({ ...resp, questions: resp.questions ?? [] });
      setDirty(false);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2200);
      return resp;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the form");
      return null;
    } finally {
      setSaving(false);
    }
  }, [config, eventId]);

  async function togglePublish(next: boolean) {
    if (!config) return;
    setPublishing(true);
    setError(null);
    try {
      // Persist any pending edits first so we never publish a stale form.
      if (dirty) {
        const saved = await save();
        if (!saved) return;
      }
      const resp = await apiFetch<FormConfig>(`/events/${eventId}/feedback-form/publish`, {
        method: "POST",
        body: JSON.stringify({ is_published: next }),
      });
      setConfig({ ...resp, questions: resp.questions ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update publish state");
    } finally {
      setPublishing(false);
    }
  }

  if (!config) {
    return error ? (
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
    ) : (
      <div className="space-y-3">
        <div className="h-32 skeleton rounded-2xl border border-border" />
        <div className="h-40 skeleton rounded-2xl border border-border" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Publish status banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              config.is_published ? "bg-success/15 text-success" : "bg-surface-2 text-muted-foreground",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", config.is_published ? "bg-success" : "bg-line-strong")} aria-hidden />
            {config.is_published ? "Live" : "Draft"}
          </span>
          <p className="text-sm text-muted-foreground">
            {config.is_published
              ? "Attendees can fill this on their recap."
              : "Only you can see this until you publish."}
          </p>
        </div>
        <Button
          variant={config.is_published ? "outline" : "accent"}
          size="sm"
          onClick={() => togglePublish(!config.is_published)}
          disabled={publishing}
          className="gap-1.5"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {config.is_published ? "Unpublish" : "Publish"}
        </Button>
      </div>

      {/* Form meta */}
      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Form title</label>
          <Input value={config.title} onChange={(e) => patch({ title: e.target.value })} maxLength={200} placeholder="e.g. How was tonight?" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Textarea value={config.description ?? ""} onChange={(e) => patch({ description: e.target.value })} maxLength={1000} rows={2} placeholder="A line of context for your guests." />
        </div>
      </Card>

      {/* Gating */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Lock className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Require feedback to unlock the recap</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                When on, guests answer this form before they can see their connections recap. Off = the recap shows first and feedback is an optional ask.
              </p>
            </div>
          </div>
          <Toggle checked={config.gate_recap} onChange={(v) => patch({ gate_recap: v })} />
        </div>
      </Card>

      {/* Identity */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <User className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Collect names with responses</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                On = you see who said what (great for following up). Off = responses are anonymous in your console. Either way, guests are told which it is.
              </p>
            </div>
          </div>
          <Toggle checked={config.collect_identity} onChange={(v) => patch({ collect_identity: v })} />
        </div>
      </Card>

      {/* Questions */}
      <div className="space-y-3">
        {config.questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            total={config.questions.length}
            onChange={(updated) => setQuestions((qs) => qs.map((x, j) => (j === i ? updated : x)))}
            onRemove={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
            onMove={(dir) =>
              setQuestions((qs) => {
                const j = i + dir;
                if (j < 0 || j >= qs.length) return qs;
                const next = [...qs];
                [next[i], next[j]] = [next[j], next[i]];
                return next;
              })
            }
          />
        ))}

        {/* Add question */}
        {adding ? (
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Pick a question type</p>
              <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUESTION_TYPE_META.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => addQuestion(t.value)}
                  className="rounded-xl border border-border bg-background/40 p-3 text-left transition-colors hover:border-accent/50"
                >
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.hint}</p>
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> Add question
          </button>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-xl lg:left-64">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-xs text-muted-foreground">
            {savedTick ? (
              <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" /> Saved</span>
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              "All changes saved"
            )}
          </p>
          <Button variant="accent" onClick={save} disabled={saving || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  q: FormQuestion;
  index: number;
  total: number;
  onChange: (q: FormQuestion) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const update = (p: Partial<FormQuestion>) => onChange({ ...q, ...p });

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Question {index + 1}</span>
        <div className="flex items-center gap-1">
          <SelectMenu
            ariaLabel="Question type"
            value={q.type}
            options={QUESTION_TYPE_META.map((t) => ({ value: t.value, label: t.label }))}
            onChange={(val) => {
              const type = val as QuestionType;
              const p: Partial<FormQuestion> = { type };
              if (isChoice(type) && q.options.filter((o) => o.trim()).length < 2) p.options = ["Option 1", "Option 2"];
              update(p);
            }}
          />
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconBtn>
          <IconBtn label="Delete question" onClick={onRemove}><Trash2 className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <Input value={q.label} onChange={(e) => update({ label: e.target.value })} maxLength={300} placeholder="Question text" />
        <Input value={q.help_text ?? ""} onChange={(e) => update({ help_text: e.target.value })} maxLength={500} placeholder="Helper text (optional)" className="h-10 text-sm" />

        {isChoice(q.type) && (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => update({ options: q.options.map((o, j) => (j === i ? e.target.value : o)) })}
                  maxLength={120}
                  placeholder={`Option ${i + 1}`}
                  className="h-10 text-sm"
                />
                <IconBtn label="Remove option" disabled={q.options.length <= 2} onClick={() => update({ options: q.options.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </IconBtn>
              </div>
            ))}
            {q.options.length < 20 && (
              <button
                type="button"
                onClick={() => update({ options: [...q.options, `Option ${q.options.length + 1}`] })}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </button>
            )}
          </div>
        )}

        {q.type === "rating" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Scale</span>
            <SelectMenu
              ariaLabel="Rating scale"
              value={String(q.scale)}
              options={[3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `1–${n}` }))}
              onChange={(v) => update({ scale: Number(v) })}
            />
          </div>
        )}
      </div>

      {/* Live preview + required toggle */}
      <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Eye className="h-3 w-3" aria-hidden /> Preview · {typeLabel(q.type)}
        </div>
        <AnswerField question={{ ...q, options: q.options.filter((o) => o.trim()) }} value={isText(q.type) ? "" : undefined} onChange={() => {}} disabled />
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Required</span>
        <Toggle checked={q.required} onChange={(v) => update({ required: v })} />
      </div>
    </Card>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* ============================== Responses view ============================== */

function ResponsesView({ eventId }: { eventId: string }) {
  const [results, setResults] = useState<FormResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "individual">("summary");

  useEffect(() => {
    apiFetch<FormResults>(`/events/${eventId}/feedback-form/results`)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load responses"));
  }, [eventId]);

  /** CSV #1 — one row per question (quick read of the aggregate). */
  function exportSummaryCsv() {
    if (!results) return;
    const rows: string[][] = [["Question", "Type", "Answered", "Summary"]];
    for (const q of results.questions) {
      let summary = "";
      if (q.type === "rating" || q.type === "nps") summary = q.average != null ? `avg ${q.average}` : "—";
      else if (q.text_answers.length) summary = q.text_answers.join(" | ");
      else summary = Object.entries(q.option_counts).map(([k, v]) => `${k}: ${v}`).join(", ");
      rows.push([q.label, q.type, String(q.answered), summary]);
    }
    downloadCsv(rows, `${slug(results.title)}-summary.csv`);
  }

  /** CSV #2 — one row per respondent, one column per question (the spreadsheet
   *  you actually work from). Adds name/company/time when identity is collected. */
  function exportResponsesCsv() {
    if (!results) return;
    const qCols = results.questions;
    const header = [
      ...(results.collect_identity ? ["Name", "Company"] : ["Respondent"]),
      "Submitted",
      ...qCols.map((q) => q.label),
    ];
    const rows: string[][] = [header];
    results.responses.forEach((r, i) => {
      const answerByQ = new Map(r.answers.map((a) => [a.question_id, a.value]));
      const idCols = results.collect_identity
        ? [r.respondent_name || "—", r.respondent_company || "—"]
        : [`Anonymous #${i + 1}`];
      rows.push([
        ...idCols,
        r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—",
        ...qCols.map((q) => formatAnswer(answerByQ.get(q.question_id), q.type)),
      ]);
    });
    downloadCsv(rows, `${slug(results.title)}-responses.csv`);
  }

  if (error) {
    return <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>;
  }
  if (!results) return <div className="h-40 skeleton rounded-2xl border border-border" />;

  if (!results.form_id) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground">
          <MessageSquareText className="h-5 w-5" aria-hidden />
        </div>
        <p className="mt-4 font-display text-xl text-foreground">No form yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Build and publish a feedback form to start collecting responses.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Response-rate KPIs */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiTile value={results.response_count} label="responses" />
        <KpiTile value={`${results.response_rate}%`} label="response rate" />
        <KpiTile value={results.total_recipients} label="checked in" />
      </div>

      {/* Summary / Individual switch + exports */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<"summary" | "individual">
          value={tab}
          onChange={setTab}
          options={[
            { value: "summary", label: "Summary" },
            { value: "individual", label: "Individual" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportSummaryCsv} disabled={results.response_count === 0} className="gap-1.5">
            <Download className="h-4 w-4" /> Summary
          </Button>
          <Button variant="outline" size="sm" onClick={exportResponsesCsv} disabled={results.response_count === 0} className="gap-1.5">
            <Download className="h-4 w-4" /> Per person
          </Button>
        </div>
      </div>

      {results.response_count === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-display text-lg text-foreground">No responses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">They&apos;ll appear here as guests fill the form on their recap.</p>
        </Card>
      ) : tab === "summary" ? (
        results.questions.map((q) => <QuestionResultCard key={q.question_id} q={q} />)
      ) : (
        <IndividualResponses results={results} />
      )}
    </div>
  );
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "feedback";
}

/** Escape one CSV cell, neutralising spreadsheet formula injection: a leading
 *  = + - @ (or tab/CR) is what Excel/Sheets treat as a formula, so respondent
 *  text starting with those is prefixed with a quote before being quoted. */
function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---- Individual ("one respondent at a time", like Google Forms) ---- */
function IndividualResponses({ results }: { results: FormResults }) {
  const [i, setI] = useState(0);
  const responses = results.responses;
  const r: IndividualResponse | undefined = responses[i];
  // Question lookup so each answer can show its label + render by type.
  const qMeta = new Map(results.questions.map((q) => [q.question_id, q]));

  if (!r) return null;
  const answerByQ = new Map(r.answers.map((a) => [a.question_id, a.value]));
  const initials = (r.respondent_name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-4">
      {/* Navigator */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
        <IconBtn label="Previous response" disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </IconBtn>
        <div className="min-w-0 text-center">
          <div className="flex items-center justify-center gap-2">
            {results.collect_identity ? (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                  {initials}
                </span>
                <span className="truncate text-sm font-medium text-foreground">
                  {r.respondent_name || "Unnamed guest"}
                  {r.respondent_company && (
                    <span className="font-normal text-muted-foreground"> · {r.respondent_company}</span>
                  )}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Anonymous #{i + 1}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Response {i + 1} of {responses.length}
            {r.submitted_at && ` · ${new Date(r.submitted_at).toLocaleString()}`}
          </p>
        </div>
        <IconBtn label="Next response" disabled={i >= responses.length - 1} onClick={() => setI((n) => Math.min(responses.length - 1, n + 1))}>
          <ChevronRight className="h-4 w-4" />
        </IconBtn>
      </div>

      {/* This respondent's answers, in form order */}
      <Card className="divide-y divide-border p-0">
        {results.questions.map((q) => {
          const val = answerByQ.get(q.question_id);
          const answered = val !== undefined && val !== null && !(typeof val === "string" && !val.trim());
          return (
            <div key={q.question_id} className="p-4 sm:p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{q.label}</p>
              <p className={cn("mt-1 text-sm", answered ? "text-foreground" : "italic text-muted-foreground")}>
                {answered ? formatAnswer(val, q.type) : "No answer"}
              </p>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function KpiTile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="font-display text-2xl leading-none text-foreground sm:text-3xl">{value}</div>
      <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</div>
    </Card>
  );
}

function QuestionResultCard({ q }: { q: FormResults["questions"][number] }) {
  const isNumeric = q.type === "rating" || q.type === "nps";
  const total = Object.values(q.option_counts).reduce((s, n) => s + n, 0) || 1;
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base text-foreground">{q.label}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{q.answered} answered</span>
      </div>

      {isNumeric && q.average != null && (
        <p className="mt-2 font-display text-3xl text-accent">
          {q.average}
          <span className="ml-1 text-sm font-normal text-muted-foreground">avg{q.type === "nps" ? " / 10" : ""}</span>
        </p>
      )}

      {(q.type === "single_choice" || q.type === "multi_choice" || q.type === "yes_no" || isNumeric) &&
        Object.keys(q.option_counts).length > 0 && (
          <div className="mt-3 space-y-2">
            {Object.entries(q.option_counts)
              .sort((a, b) => (isNumeric ? Number(a[0]) - Number(b[0]) : b[1] - a[1]))
              .map(([opt, count]) => (
                <div key={opt}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-foreground">{opt}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
        )}

      {isText(q.type) && (
        <ul className="mt-3 space-y-2">
          {q.text_answers.length === 0 ? (
            <li className="text-sm text-muted-foreground">No written answers.</li>
          ) : (
            q.text_answers.map((t, i) => (
              <li key={i} className="rounded-xl border border-border bg-background/40 px-3 py-2 text-sm text-foreground">
                {t}
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  );
}
