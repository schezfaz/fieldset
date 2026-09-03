// Shared data shapes — mirrors tools.md §"Data shapes".

// The interactive element types the agent must be able to both build and fill,
// plus "section" (a structural header with no answer).
export type QuestionKind =
  | "short_text" | "long_text" | "email" | "number"
  | "url" | "phone" | "currency" | "rich_text"
  | "single_choice" | "multi_choice" | "dropdown" | "multi_dropdown"
  | "yes_no" | "ranking"
  | "rating" | "slider" | "opinion_scale" | "nps" | "matrix"
  | "date" | "time"
  | "address" | "file" | "signature" | "color" | "image" | "video"
  | "section" | "statement" | "page_break" | "consent" | "hidden" | "payment";

export interface Question {
  questionId: string;
  kind: QuestionKind;
  label: string;
  required: boolean;
  options?: string[];   // single_choice | multi_choice | dropdown | multi_dropdown | ranking | matrix (columns)
  rows?: string[];      // matrix (row labels)
  min?: number;         // number | rating | slider | opinion_scale | nps | currency
  max?: number;
  step?: number;        // slider
  price?: number;       // payment | optional unit price per option
}

export interface FormSettings {
  deadline?: string;            // ISO 8601
  oneResponsePerPerson: boolean;
  anonymous: boolean;
  collectName: boolean;
}

export type FormStatus = "draft" | "published" | "closed";

export interface Form {
  formId: string;
  title: string;
  description?: string;
  questions: Question[];
  settings: FormSettings;
  status: FormStatus;
  shareUrl?: string;
  createdAt: string;
}

export type AnswerValue = string | string[] | number;
export interface Answer { questionId: string; value: AnswerValue; }

export interface FormResponse {
  responseId: string;
  name?: string;
  answers: Answer[];
  submittedAt: string;
  sessionId?: string;
}

// A conclusion drawn from the responses and posted onto the results page.
export interface Insight {
  insightId: string;
  text: string;
  by: "agent" | "human";
  createdAt: string;
}

// Standard tool/return envelope.
export type Ok<T = Record<string, unknown>> = { ok: true } & T;
export type Err = { ok: false; error: { code: string; message: string } };
export type Result<T = Record<string, unknown>> = Ok<T> | Err;

export const err = (code: string, message: string): Err => ({ ok: false, error: { code, message } });
