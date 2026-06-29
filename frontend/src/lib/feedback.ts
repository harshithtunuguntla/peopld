// Shared types + helpers for the customizable feedback forms (builder, attendee
// fill, and results). Mirrors backend/app/models/schemas.py.

export type QuestionType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice"
  | "rating"
  | "nps"
  | "yes_no";

export interface FormQuestion {
  id?: string | null;
  type: QuestionType;
  label: string;
  help_text?: string | null;
  required: boolean;
  options: string[];
  scale: number;
}

export interface FormConfig {
  id?: string | null;
  event_id: string;
  title: string;
  description?: string | null;
  is_published: boolean;
  gate_recap: boolean;
  collect_identity: boolean;
  questions: FormQuestion[];
}

export interface AttendeeForm {
  available: boolean;
  submitted: boolean;
  gate_recap: boolean;
  collect_identity: boolean;
  title: string;
  description?: string | null;
  questions: FormQuestion[];
}

export interface QuestionResult {
  question_id: string;
  label: string;
  type: QuestionType;
  answered: number;
  option_counts: Record<string, number>;
  average: number | null;
  text_answers: string[];
}

/** One answer inside an individual response (value shaped by the question type). */
export interface ResponseAnswer {
  question_id: string;
  value: AnswerValue | null;
}

/** A single attendee's full submission (the "Individual" responses view). */
export interface IndividualResponse {
  submission_id: string;
  respondent_name?: string | null;
  respondent_company?: string | null;
  respondent_avatar_url?: string | null;
  submitted_at?: string | null;
  answers: ResponseAnswer[];
}

export interface FormResults {
  form_id: string | null;
  title: string;
  is_published: boolean;
  gate_recap: boolean;
  collect_identity: boolean;
  total_recipients: number;
  response_count: number;
  response_rate: number;
  questions: QuestionResult[];
  responses: IndividualResponse[];
}

/** Answer value shapes by question type: string | number | string[]. */
export type AnswerValue = string | number | string[];

export const CHOICE_TYPES: QuestionType[] = ["single_choice", "multi_choice"];
export const isChoice = (t: QuestionType) => CHOICE_TYPES.includes(t);
export const isText = (t: QuestionType) => t === "short_text" || t === "long_text";

/** Builder palette — label + one-line hint shown when picking a question type. */
export const QUESTION_TYPE_META: { value: QuestionType; label: string; hint: string }[] = [
  { value: "short_text", label: "Short answer", hint: "A single line of text" },
  { value: "long_text", label: "Paragraph", hint: "A longer, multi-line answer" },
  { value: "single_choice", label: "Multiple choice", hint: "Pick exactly one option" },
  { value: "multi_choice", label: "Checkboxes", hint: "Pick any number of options" },
  { value: "rating", label: "Star rating", hint: "Rate on a 1–N scale" },
  { value: "nps", label: "NPS (0–10)", hint: "How likely to recommend" },
  { value: "yes_no", label: "Yes / No", hint: "A simple two-way answer" },
];

export function typeLabel(t: QuestionType): string {
  return QUESTION_TYPE_META.find((m) => m.value === t)?.label ?? t;
}

export function blankQuestion(type: QuestionType = "short_text"): FormQuestion {
  return {
    type,
    label: "",
    help_text: "",
    required: false,
    options: isChoice(type) ? ["Option 1", "Option 2"] : [],
    scale: 5,
  };
}

/** Human-readable rendering of one answer value, by question type — used in the
 *  individual-response view and the per-respondent CSV. Empty → an em dash. */
export function formatAnswer(
  v: AnswerValue | null | undefined,
  type: QuestionType,
): string {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (type === "rating") return `${v}★`;
  if (type === "nps") return `${v} / 10`;
  return String(v);
}

/** Is this answer "empty" for required-validation purposes? */
export function isAnswerEmpty(v: AnswerValue | undefined | null): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false; // a number (including 0 for NPS) counts as answered
}
