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
  Copy,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { useOrganizer } from "@/lib/organizer/use-organizer";
import { ConsoleShell } from "@/components/organizer/console-shell";
import { ConsoleGate } from "@/components/organizer/console-ui";
import { Card } from "@/components/organizer/console-ui";
import { Segmented, Toggle, RefreshButton } from "@/components/organizer/console-ui";
import { EventHeader, EventAccessError } from "@/components/organizer/event-header";
import { QuestionResultCard } from "@/components/organizer/feedback/question-result-card";
import { type EventInfo } from "@/components/organizer/live/types";
import { AnswerField } from "@/components/feedback/answer-field";
import { SearchBox } from "@/components/connections/search-box";
import { useDebouncedValue } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import {
  type FormConfig,
  type FormQuestion,
  type FormResults,
  type FormTemplate,
  type IndividualResponse,
  type QuestionType,
  FORM_TEMPLATES,
  QUESTION_TYPE_META,
  blankQuestion,
  formatAnswer,
  isChoice,
  isText,
  typeLabel,
  type AnswerValue,
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
  // Honour ?view=responses (deep link from the command center's "View responses").
  const [view, setView] = useState<"build" | "responses">(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "responses"
      ? "responses"
      : "build",
  );
  // Manual refresh of the responses view (matches the rest of the console).
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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
      <EventHeader
        eventId={eventId}
        name={event?.name}
        status={event?.status}
        active="feedback"
        actions={
          view === "responses" ? (
            <RefreshButton onClick={() => setReloadToken((t) => t + 1)} busy={refreshing} />
          ) : undefined
        }
      />
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
      {view === "build" ? (
        <BuildView eventId={eventId} />
      ) : (
        <ResponsesView eventId={eventId} reloadToken={reloadToken} onLoadingChange={setRefreshing} />
      )}
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
  const [previewing, setPreviewing] = useState(false);

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

  function applyTemplate(t: FormTemplate) {
    patch({ title: t.title, description: t.description ?? "" });
    setQuestions(() => t.questions.map((q) => ({ ...q, options: [...q.options] })));
  }

  function duplicateAt(i: number) {
    setQuestions((qs) => {
      const src = qs[i];
      const clone: FormQuestion = { ...src, id: undefined, options: [...src.options] };
      const next = [...qs];
      next.splice(i + 1, 0, clone);
      return next;
    });
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

  const responseCount = config.response_count ?? 0;

  return (
    <div className="space-y-4 pb-28">
      {previewing && <PreviewOverlay config={config} onClose={() => setPreviewing(false)} />}

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Live-data guard: once people have answered, edits can affect collected
          answers. Adding/reordering/rewording is safe; removing or retyping a
          question drops the answers gathered for it (we confirm those inline). */}
      {responseCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm text-foreground">
            <span className="font-medium">{responseCount} {responseCount === 1 ? "person has" : "people have"} already responded.</span>{" "}
            Adding questions, reordering, and editing wording are safe. Removing a question — or changing its
            type — will drop the answers already collected for it.
          </p>
        </div>
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

      {/* Templates — only when the form is still empty, so an organizer never
          stares at a blank builder. Applying one fills the fields to edit. */}
      {config.questions.length === 0 && <TemplateGallery onPick={applyTemplate} />}

      {/* Questions */}
      <div className="space-y-3">
        {config.questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            total={config.questions.length}
            responseCount={responseCount}
            onChange={(updated) => setQuestions((qs) => qs.map((x, j) => (j === i ? updated : x)))}
            onRemove={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
            onDuplicate={() => duplicateAt(i)}
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
            ) : config.is_published ? (
              <span className="inline-flex items-center gap-1 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Live</span>
            ) : (
              "Draft — saved"
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPreviewing(true)}
              disabled={config.questions.length === 0}
              className="gap-1.5"
              title="See the form exactly as guests will"
            >
              <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button variant="outline" onClick={save} disabled={saving || !dirty} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </Button>
            <Button
              variant={config.is_published ? "outline" : "accent"}
              onClick={() => togglePublish(!config.is_published)}
              disabled={publishing}
              className="gap-1.5"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : config.is_published ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {config.is_published ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  index,
  total,
  responseCount,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  q: FormQuestion;
  index: number;
  total: number;
  responseCount: number;
  onChange: (q: FormQuestion) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const update = (p: Partial<FormQuestion>) => onChange({ ...q, ...p });
  // Only guard questions that already exist (have an id) and have collected data.
  const hasData = responseCount > 0 && !!q.id;

  function handleTypeChange(val: string) {
    const type = val as QuestionType;
    if (type === q.type) return;
    if (
      hasData &&
      !window.confirm(
        "Change this question's type? Answers already collected for it may no longer match the new format.",
      )
    )
      return;
    const p: Partial<FormQuestion> = { type };
    if (isChoice(type) && q.options.filter((o) => o.trim()).length < 2) p.options = ["Option 1", "Option 2"];
    update(p);
  }

  function handleRemove() {
    if (
      hasData &&
      !window.confirm(
        `Delete this question? The ${responseCount === 1 ? "answer" : "answers"} already collected for it will be removed.`,
      )
    )
      return;
    onRemove();
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Question {index + 1}</span>
        <div className="flex items-center gap-1">
          <SelectMenu
            ariaLabel="Question type"
            value={q.type}
            options={QUESTION_TYPE_META.map((t) => ({ value: t.value, label: t.label }))}
            onChange={handleTypeChange}
          />
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconBtn>
          <IconBtn label="Duplicate question" onClick={onDuplicate}><Copy className="h-4 w-4" /></IconBtn>
          <IconBtn label="Delete question" onClick={handleRemove}><Trash2 className="h-4 w-4" /></IconBtn>
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

/** Starter-form picker shown when the builder is empty. */
function TemplateGallery({ onPick }: { onPick: (t: FormTemplate) => void }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="font-display text-lg text-foreground">Start with a template</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a ready-made form and tweak it, or add your own questions below from scratch.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORM_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="group rounded-2xl border border-border bg-background/40 p-4 text-left transition-colors hover:border-accent/50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{t.name}</p>
              <span className="text-xs text-muted-foreground">{t.questions.length} questions</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
              <Plus className="h-3.5 w-3.5" /> Use this template
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Full-form "see it as a guest will" preview — interactive controls, nothing
 *  saved. Reuses the exact AnswerField the attendee fills, so it's faithful. */
function PreviewOverlay({ config, onClose }: { config: FormConfig; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const questions = config.questions.filter((q) => q.label.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Form preview"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
            <Eye className="h-3.5 w-3.5" aria-hidden /> Preview — answers aren&apos;t saved
          </span>
          <button type="button" onClick={onClose} aria-label="Close preview" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="font-display text-xl text-foreground">{config.title || "Untitled form"}</h2>
        {config.description && <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>}

        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground">
          {config.collect_identity ? (
            <><User className="h-3.5 w-3.5" aria-hidden /> Your name is shared with the organizer</>
          ) : (
            <><EyeOff className="h-3.5 w-3.5" aria-hidden /> Responses are anonymous</>
          )}
        </p>

        <div className="mt-5 space-y-5">
          {questions.map((q, i) => {
            const key = q.id ?? `preview-${i}`;
            return (
              <div key={key}>
                <label className="block text-sm font-medium text-foreground">
                  {q.label}
                  {q.required && <span className="ml-1 text-accent">*</span>}
                </label>
                {q.help_text && <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{q.help_text}</p>}
                <div className="mt-2">
                  <AnswerField
                    question={{ ...q, options: q.options.filter((o) => o.trim()) }}
                    value={answers[key]}
                    onChange={(v) => setAnswers((prev) => ({ ...prev, [key]: v }))}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="accent" onClick={onClose} className="gap-1.5">
            <Check className="h-4 w-4" /> Looks good
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Responses view ============================== */

function ResponsesView({
  eventId,
  reloadToken,
  onLoadingChange,
}: {
  eventId: string;
  reloadToken: number;
  onLoadingChange?: (busy: boolean) => void;
}) {
  const [results, setResults] = useState<FormResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "individual">("summary");

  // Refetch on mount and whenever the header Refresh is tapped (reloadToken bumps).
  // Keeps the old data on screen while refreshing — no skeleton flash.
  useEffect(() => {
    let cancelled = false;
    onLoadingChange?.(true);
    setError(null);
    apiFetch<FormResults>(`/events/${eventId}/feedback-form/results`)
      .then((r) => !cancelled && setResults(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load responses"))
      .finally(() => !cancelled && onLoadingChange?.(false));
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadToken, onLoadingChange]);

  const [exporting, setExporting] = useState(false);

  /** The CSVs need the FULL detail (all responses + text), which the default
   *  results view no longer ships — so we pull it from the export endpoint on
   *  click. Bounded by the event's response count; an explicit download. */
  async function fetchFull(): Promise<FormResults | null> {
    if (!results) return null;
    try {
      setExporting(true);
      return await apiFetch<FormResults>(`/events/${eventId}/feedback-form/results/export`);
    } catch {
      return null;
    } finally {
      setExporting(false);
    }
  }

  /** CSV #1 — one row per question (quick read of the aggregate). */
  async function exportSummaryCsv() {
    const full = await fetchFull();
    if (!full) return;
    const rows: string[][] = [["Question", "Type", "Answered", "Summary"]];
    for (const q of full.questions) {
      let summary = "";
      if (q.type === "rating" || q.type === "nps") summary = q.average != null ? `avg ${q.average}` : "—";
      else if (q.text_answers.length) summary = q.text_answers.join(" | ");
      else summary = Object.entries(q.option_counts).map(([k, v]) => `${k}: ${v}`).join(", ");
      rows.push([q.label, q.type, String(q.answered), summary]);
    }
    downloadCsv(rows, `${slug(full.title)}-summary.csv`);
  }

  /** CSV #2 — one row per respondent, one column per question (the spreadsheet
   *  you actually work from). Adds name/company/time when identity is collected. */
  async function exportResponsesCsv() {
    const full = await fetchFull();
    if (!full) return;
    const qCols = full.questions;
    const header = [
      ...(full.collect_identity ? ["Name", "Company"] : ["Respondent"]),
      "Submitted",
      ...qCols.map((q) => q.label),
    ];
    const rows: string[][] = [header];
    full.responses.forEach((r, i) => {
      const answerByQ = new Map(r.answers.map((a) => [a.question_id, a.value]));
      const idCols = full.collect_identity
        ? [r.respondent_name || "—", r.respondent_company || "—"]
        : [`Anonymous #${i + 1}`];
      rows.push([
        ...idCols,
        r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—",
        ...qCols.map((q) => formatAnswer(answerByQ.get(q.question_id), q.type)),
      ]);
    });
    downloadCsv(rows, `${slug(full.title)}-responses.csv`);
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
          <Button variant="outline" size="sm" onClick={exportSummaryCsv} disabled={results.response_count === 0 || exporting} className="gap-1.5">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Summary
          </Button>
          <Button variant="outline" size="sm" onClick={exportResponsesCsv} disabled={results.response_count === 0 || exporting} className="gap-1.5">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Per person
          </Button>
        </div>
      </div>

      {results.response_count === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-display text-lg text-foreground">No responses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">They&apos;ll appear here as guests fill the form on their recap.</p>
        </Card>
      ) : tab === "summary" ? (
        results.questions.map((q) => (
          <QuestionResultCard key={q.question_id} q={q} eventId={eventId} responseCount={results.response_count} reloadToken={reloadToken} />
        ))
      ) : (
        <IndividualResponses eventId={eventId} results={results} reloadToken={reloadToken} />
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

interface PagedResponses {
  items: IndividualResponse[];
  total: number;
  page: number;
  limit: number;
}

/* ---- Individual ("one respondent at a time", like Google Forms) ----
   Server-paginated at limit=1: `page` is the 1-based pointer into the (optionally
   searched) respondent list, so the browser only ever holds the one on screen. */
function IndividualResponses({ eventId, results, reloadToken }: { eventId: string; results: FormResults; reloadToken: number }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedResponses | null>(null);
  const [loading, setLoading] = useState(true);

  const base = `/events/${eventId}/feedback-form/results/responses`;

  useEffect(() => {
    setPage(1); // new search → first match
  }, [debounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: "1" });
    if (debounced && results.collect_identity) qs.set("q", debounced);
    apiFetch<PagedResponses>(`${base}?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ items: [], total: 0, page: 1, limit: 1 }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [base, page, debounced, results.collect_identity, reloadToken]);

  const total = data?.total ?? 0;
  const r = data?.items[0];

  const searchBox = results.collect_identity ? (
    <SearchBox value={query} onChange={setQuery} placeholder="Find a respondent by name or company…" ariaLabel="Search responses" />
  ) : null;

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {searchBox}
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading responses" />
        </div>
      </div>
    );
  }

  if (!r) {
    return (
      <div className="space-y-4">
        {searchBox}
        <p className="py-8 text-center text-sm text-muted-foreground">
          {debounced ? `No respondent matches “${debounced}”.` : "No responses yet."}
        </p>
      </div>
    );
  }

  const answerByQ = new Map(r.answers.map((a) => [a.question_id, a.value]));
  const initials = (r.respondent_name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-4">
      {searchBox}
      {/* Navigator */}
      <div className={cn("flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 transition-opacity", loading && "opacity-60")}>
        <IconBtn label="Previous response" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
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
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Anonymous #{page}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Response {page} of {total}
            {r.submitted_at && ` · ${new Date(r.submitted_at).toLocaleString()}`}
          </p>
        </div>
        <IconBtn label="Next response" disabled={page >= total} onClick={() => setPage((n) => Math.min(total, n + 1))}>
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

