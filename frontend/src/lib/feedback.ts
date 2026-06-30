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
  /** Submissions collected so far — drives the builder's "edit live data" guard. */
  response_count?: number;
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

/* ----------------------------- Starter templates ----------------------------- */

/** Build a fully-formed question for a template (sane defaults, no id). */
function tq(type: QuestionType, label: string, extra: Partial<FormQuestion> = {}): FormQuestion {
  return { ...blankQuestion(type), label, ...extra };
}

export interface FormTemplate {
  id: string;
  name: string;
  /** One line describing what this template is good for (shown on the card). */
  tagline: string;
  title: string;
  description?: string | null;
  questions: FormQuestion[];
}

/**
 * Ready-to-edit starter forms so an organizer never faces a blank builder. These
 * are just seed content — applying one fills the builder, which the organizer can
 * then tweak and publish like any other form.
 */
export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "pulse",
    name: "Quick pulse",
    tagline: "Two questions, 20 seconds — the highest response rates.",
    title: "Quick pulse",
    description: "Just two quick questions — thank you!",
    questions: [
      tq("nps", "How likely are you to recommend this event to a friend or colleague?", { required: true }),
      tq("long_text", "What's the main reason for your score?"),
    ],
  },
  {
    id: "event-feedback",
    name: "Event feedback",
    tagline: "A well-rounded post-event survey covering the essentials.",
    title: "Event feedback",
    description: "A few quick questions — it helps us make the next one even better.",
    questions: [
      tq("rating", "How would you rate the event overall?", { required: true, scale: 5 }),
      tq("nps", "How likely are you to recommend this event?", { required: true }),
      tq("long_text", "What did you enjoy most?"),
      tq("long_text", "What could we do better next time?"),
      tq("single_choice", "Would you come to another event like this?", {
        options: ["Definitely", "Maybe", "Probably not"],
      }),
    ],
  },
  {
    id: "networking",
    name: "Networking value",
    tagline: "Measure the connections — perfect for a matchmaking event.",
    title: "How was the networking?",
    description: "We design these nights around the people you meet — tell us how it went.",
    questions: [
      tq("rating", "How valuable were the connections you made?", { required: true, scale: 5 }),
      tq("yes_no", "Did you meet someone you'll follow up with?", { required: true }),
      tq("long_text", "Who did you connect with, or what made it work?"),
      tq("single_choice", "How many new people did you have a real conversation with?", {
        options: ["0", "1–2", "3–5", "6+"],
      }),
    ],
  },
  {
    id: "sessions",
    name: "Sessions & speakers",
    tagline: "For talks and panels — rate content and delivery.",
    title: "Sessions & speakers",
    description: "Help us book the right speakers and topics next time.",
    questions: [
      tq("rating", "How would you rate the content?", { required: true, scale: 5 }),
      tq("rating", "How would you rate the speakers?", { required: true, scale: 5 }),
      tq("long_text", "What was your biggest takeaway?"),
      tq("long_text", "Any topics or speakers you'd like to see next time?"),
    ],
  },
];

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
