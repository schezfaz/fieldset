"use client";

import { Form, FormResponse, Insight } from "./types";
import type { Aggregate } from "./aggregate";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return body as T;
}

export const api = {
  createForm: (input: { title: string; description?: string }) =>
    jsonFetch<{ ok: boolean; formId?: string; error?: unknown }>("/api/forms", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getForm: (id: string) =>
    jsonFetch<{ ok: boolean; form?: Form; error?: unknown }>(`/api/forms/${id}`),

  patchForm: (id: string, patch: Record<string, unknown>) =>
    jsonFetch<{ ok: boolean; form?: Form }>(`/api/forms/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  addQuestion: (id: string, q: Record<string, unknown>) =>
    jsonFetch<{ ok: boolean; questionId?: string; form?: Form }>(`/api/forms/${id}/questions`, {
      method: "POST",
      body: JSON.stringify(q),
    }),

  updateQuestion: (id: string, questionId: string, patch: Record<string, unknown>) =>
    jsonFetch<{ ok: boolean; form?: Form }>(`/api/forms/${id}/questions`, {
      method: "PATCH",
      body: JSON.stringify({ questionId, patch }),
    }),

  removeQuestion: (id: string, questionId: string) =>
    jsonFetch<{ ok: boolean; form?: Form }>(`/api/forms/${id}/questions`, {
      method: "DELETE",
      body: JSON.stringify({ questionId }),
    }),

  reorderQuestions: (id: string, order: string[]) =>
    jsonFetch<{ ok: boolean; form?: Form }>(`/api/forms/${id}/questions/reorder`, {
      method: "POST",
      body: JSON.stringify({ order }),
    }),

  publishForm: (id: string) =>
    jsonFetch<{ ok: boolean; status?: string; shareUrl?: string }>(`/api/forms/${id}/publish`, {
      method: "POST",
    }),

  listResponses: (id: string) =>
    jsonFetch<{ ok: boolean; responses?: FormResponse[]; count?: number }>(`/api/forms/${id}/responses`),

  getAggregate: (id: string) =>
    jsonFetch<{ ok: boolean } & Partial<Aggregate>>(`/api/forms/${id}/aggregate`),

  listInsights: (id: string) =>
    jsonFetch<{ ok: boolean; insights?: Insight[] }>(`/api/forms/${id}/insights`),

  addInsight: (id: string, text: string, by: "agent" | "human" = "agent") =>
    jsonFetch<{ ok: boolean; insight?: Insight; error?: { code: string; message: string } }>(
      `/api/forms/${id}/insights`,
      { method: "POST", body: JSON.stringify({ text, by }) },
    ),

  submitResponse: (id: string, r: { name?: string; answers: FormResponse["answers"]; sessionId?: string }) =>
    jsonFetch<{ ok: boolean; responseId?: string; error?: { code: string; message: string } }>(
      `/api/forms/${id}/responses`,
      { method: "POST", body: JSON.stringify(r) },
    ),
};
