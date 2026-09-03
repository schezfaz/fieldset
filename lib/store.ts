// In-memory store for the MVP. Survives dev HMR via globalThis.
//
// ⚠️ Serverless caveat: on Vercel each function invocation may get a fresh process,
// so this does NOT persist across deploys/regions. For the local demo (single `next dev`
// process) it works end-to-end. Swap this module for an Upstash Redis adapter (same
// function signatures) before a multi-instance deploy — see SPEC §6.

import { Form, FormResponse, FormSettings, Insight, Question, QuestionKind } from "./types";

interface DB {
  forms: Map<string, Form>;
  responses: Map<string, FormResponse[]>;
  insights: Map<string, Insight[]>;
  seq: number;
}

const g = globalThis as unknown as { __quorumDB?: DB };
const db: DB = g.__quorumDB ?? (g.__quorumDB = { forms: new Map(), responses: new Map(), insights: new Map(), seq: 0 });
// A DB created before `insights` existed survives HMR without the new map — backfill it.
if (!db.insights) db.insights = new Map();

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export function createForm(input: {
  title: string; description?: string;
}): Form {
  const form: Form = {
    formId: rid("frm"),
    title: input.title,
    description: input.description,
    questions: [],
    settings: { oneResponsePerPerson: true, anonymous: false, collectName: false },
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  db.forms.set(form.formId, form);
  db.responses.set(form.formId, []);
  return form;
}

export const getForm = (id: string): Form | undefined => db.forms.get(id);

export function patchForm(id: string, patch: Partial<Pick<Form, "title" | "description" | "status" | "shareUrl">> & { settings?: Partial<FormSettings> }): Form | undefined {
  const f = db.forms.get(id);
  if (!f) return undefined;
  if (patch.title !== undefined) f.title = patch.title;
  if (patch.description !== undefined) f.description = patch.description;
  if (patch.status !== undefined) f.status = patch.status;
  if (patch.shareUrl !== undefined) f.shareUrl = patch.shareUrl;
  if (patch.settings) f.settings = { ...f.settings, ...patch.settings };
  return f;
}

export function addQuestion(id: string, q: {
  kind: QuestionKind; label: string; required?: boolean; options?: string[]; min?: number; max?: number; step?: number; price?: number;
}): Question | undefined {
  const f = db.forms.get(id);
  if (!f) return undefined;
  const question: Question = {
    questionId: `q_${++db.seq}`,
    kind: q.kind,
    label: q.label,
    required: q.required ?? false,
    options: q.options,
    min: q.min,
    max: q.max,
    step: q.step,
    price: q.price,
  };
  f.questions.push(question);
  return question;
}

export function updateQuestion(id: string, questionId: string, patch: Partial<Omit<Question, "questionId">>): Question | undefined {
  const f = db.forms.get(id);
  const q = f?.questions.find((x) => x.questionId === questionId);
  if (!q) return undefined;
  Object.assign(q, patch);
  return q;
}

export function removeQuestion(id: string, questionId: string): boolean {
  const f = db.forms.get(id);
  if (!f) return false;
  const before = f.questions.length;
  f.questions = f.questions.filter((x) => x.questionId !== questionId);
  return f.questions.length < before;
}

export function reorderQuestions(id: string, order: string[]): boolean {
  const f = db.forms.get(id);
  if (!f) return false;
  const byId = new Map(f.questions.map((q) => [q.questionId, q]));
  const next = order.map((qid) => byId.get(qid)).filter(Boolean) as Question[];
  if (next.length !== f.questions.length) return false;
  f.questions = next;
  return true;
}

export function addResponse(id: string, r: { name?: string; answers: FormResponse["answers"]; sessionId?: string }): FormResponse | undefined {
  const f = db.forms.get(id);
  if (!f) return undefined;
  const list = db.responses.get(id)!;
  const response: FormResponse = {
    responseId: rid("resp"),
    name: r.name,
    answers: r.answers,
    submittedAt: new Date().toISOString(),
    sessionId: r.sessionId,
  };
  list.push(response);
  return response;
}

export const listResponses = (id: string): FormResponse[] => db.responses.get(id) ?? [];

export const hasSessionResponded = (id: string, sessionId: string): boolean =>
  (db.responses.get(id) ?? []).some((r) => r.sessionId === sessionId);

// --- insights: conclusions posted onto the results page (usually by an agent) -----
export function addInsight(id: string, input: { text: string; by?: "agent" | "human" }): Insight | undefined {
  if (!db.forms.has(id)) return undefined;
  const list = db.insights.get(id) ?? [];
  const insight: Insight = {
    insightId: rid("ins"),
    text: input.text,
    by: input.by ?? "agent",
    createdAt: new Date().toISOString(),
  };
  list.push(insight);
  db.insights.set(id, list);
  return insight;
}

export const listInsights = (id: string): Insight[] => db.insights.get(id) ?? [];
