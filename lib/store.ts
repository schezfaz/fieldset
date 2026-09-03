// Persistence for forms, responses, and insights.
//
// Backed by Upstash Redis (REST, so it works from Vercel's serverless functions)
// when UPSTASH_REDIS_REST_URL/TOKEN — or Vercel's own KV_REST_API_URL/TOKEN, same
// product under an older integration name — are set. Falls back to an in-memory
// store (survives dev HMR via globalThis) so `next dev` works with zero setup.
//
// ⚠️ The in-memory fallback does NOT persist across serverless invocations —
// only use it locally. Every exported function is async so callers don't care
// which backend is active.

import { Redis } from "@upstash/redis";
import { Form, FormResponse, FormSettings, Insight, Question, QuestionKind } from "./types";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

if (!redis && process.env.NODE_ENV !== "test") {
  console.warn(
    "[store] No UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_*) found — using the in-memory " +
    "store. Fine for `next dev`; data will NOT persist across serverless invocations in prod."
  );
}

const kForm = (id: string) => `form:${id}`;
const kResponses = (id: string) => `responses:${id}`;
const kInsights = (id: string) => `insights:${id}`;

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

// ---- in-memory fallback ----------------------------------------------------
interface DB {
  forms: Map<string, Form>;
  responses: Map<string, FormResponse[]>;
  insights: Map<string, Insight[]>;
  seq: number;
}
const g = globalThis as unknown as { __quorumDB?: DB };
const mem: DB = g.__quorumDB ?? (g.__quorumDB = { forms: new Map(), responses: new Map(), insights: new Map(), seq: 0 });
if (!mem.insights) mem.insights = new Map(); // backfill for a DB created before insights existed

async function nextSeq(): Promise<number> {
  return redis ? redis.incr("seq") : ++mem.seq;
}

export async function createForm(input: { title: string; description?: string }): Promise<Form> {
  const form: Form = {
    formId: rid("frm"),
    title: input.title,
    description: input.description,
    questions: [],
    settings: { oneResponsePerPerson: true, anonymous: false, collectName: false },
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  if (redis) {
    await Promise.all([redis.set(kForm(form.formId), form), redis.set(kResponses(form.formId), [])]);
  } else {
    mem.forms.set(form.formId, form);
    mem.responses.set(form.formId, []);
  }
  return form;
}

export async function getForm(id: string): Promise<Form | undefined> {
  if (redis) return (await redis.get<Form>(kForm(id))) ?? undefined;
  return mem.forms.get(id);
}

async function saveForm(form: Form): Promise<void> {
  if (redis) await redis.set(kForm(form.formId), form);
}

export async function patchForm(
  id: string,
  patch: Partial<Pick<Form, "title" | "description" | "status" | "shareUrl">> & { settings?: Partial<FormSettings> }
): Promise<Form | undefined> {
  const f = await getForm(id);
  if (!f) return undefined;
  if (patch.title !== undefined) f.title = patch.title;
  if (patch.description !== undefined) f.description = patch.description;
  if (patch.status !== undefined) f.status = patch.status;
  if (patch.shareUrl !== undefined) f.shareUrl = patch.shareUrl;
  if (patch.settings) f.settings = { ...f.settings, ...patch.settings };
  await saveForm(f);
  return f;
}

export async function addQuestion(id: string, q: {
  kind: QuestionKind; label: string; required?: boolean; options?: string[]; rows?: string[];
  min?: number; max?: number; step?: number;
}): Promise<Question | undefined> {
  const f = await getForm(id);
  if (!f) return undefined;
  const question: Question = {
    questionId: `q_${await nextSeq()}`,
    kind: q.kind,
    label: q.label,
    required: q.required ?? false,
    options: q.options,
    rows: q.rows,
    min: q.min,
    max: q.max,
    step: q.step,
  };
  f.questions.push(question);
  await saveForm(f);
  return question;
}

export async function updateQuestion(id: string, questionId: string, patch: Partial<Omit<Question, "questionId">>): Promise<Question | undefined> {
  const f = await getForm(id);
  const q = f?.questions.find((x) => x.questionId === questionId);
  if (!f || !q) return undefined;
  Object.assign(q, patch);
  await saveForm(f);
  return q;
}

export async function removeQuestion(id: string, questionId: string): Promise<boolean> {
  const f = await getForm(id);
  if (!f) return false;
  const before = f.questions.length;
  f.questions = f.questions.filter((x) => x.questionId !== questionId);
  if (f.questions.length === before) return false;
  await saveForm(f);
  return true;
}

export async function reorderQuestions(id: string, order: string[]): Promise<boolean> {
  const f = await getForm(id);
  if (!f) return false;
  const byId = new Map(f.questions.map((q) => [q.questionId, q]));
  const next = order.map((qid) => byId.get(qid)).filter(Boolean) as Question[];
  if (next.length !== f.questions.length) return false;
  f.questions = next;
  await saveForm(f);
  return true;
}

export async function addResponse(id: string, r: { name?: string; answers: FormResponse["answers"]; sessionId?: string }): Promise<FormResponse | undefined> {
  const f = await getForm(id);
  if (!f) return undefined;
  const response: FormResponse = {
    responseId: rid("resp"),
    name: r.name,
    answers: r.answers,
    submittedAt: new Date().toISOString(),
    sessionId: r.sessionId,
  };
  if (redis) {
    const list = (await redis.get<FormResponse[]>(kResponses(id))) ?? [];
    list.push(response);
    await redis.set(kResponses(id), list);
  } else {
    (mem.responses.get(id) ?? mem.responses.set(id, []).get(id)!).push(response);
  }
  return response;
}

export async function listResponses(id: string): Promise<FormResponse[]> {
  if (redis) return (await redis.get<FormResponse[]>(kResponses(id))) ?? [];
  return mem.responses.get(id) ?? [];
}

export async function hasSessionResponded(id: string, sessionId: string): Promise<boolean> {
  const responses = await listResponses(id);
  return responses.some((r) => r.sessionId === sessionId);
}

// --- insights: conclusions posted onto the results page (usually by an agent) -----
export async function addInsight(id: string, input: { text: string; by?: "agent" | "human" }): Promise<Insight | undefined> {
  if (!(await getForm(id))) return undefined;
  const insight: Insight = {
    insightId: rid("ins"),
    text: input.text,
    by: input.by ?? "agent",
    createdAt: new Date().toISOString(),
  };
  if (redis) {
    const list = (await redis.get<Insight[]>(kInsights(id))) ?? [];
    list.push(insight);
    await redis.set(kInsights(id), list);
  } else {
    const list = mem.insights.get(id) ?? [];
    list.push(insight);
    mem.insights.set(id, list);
  }
  return insight;
}

export async function listInsights(id: string): Promise<Insight[]> {
  if (redis) return (await redis.get<Insight[]>(kInsights(id))) ?? [];
  return mem.insights.get(id) ?? [];
}
