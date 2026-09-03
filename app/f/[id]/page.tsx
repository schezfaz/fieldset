"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { elementByKind } from "@/lib/elements";
import { AnswerValue, Form, Question } from "@/lib/types";
import { FieldControl } from "@/components/FieldControl";
import { BrandMark } from "@/components/BrandMark";
import { confirmGate, useWebMCP, webmcpAvailable } from "@/lib/webmcp";
import { requestAlert } from "@/components/ConfirmModal";
import { getSessionId } from "@/lib/session";
import { invalidReason } from "@/lib/validate";

type Answers = Record<string, AnswerValue>;

// The question that controls a dependent question's options (matched by `key`), if any.
function controllingQuestion(q: Question, questions: Question[]): Question | undefined {
  return q.dependsOnKey ? questions.find((x) => x.key === q.dependsOnKey) : undefined;
}

// A dependent question's options come from optionsMap[controllingAnswer]; every other
// question just uses its own options.
function resolveOptions(q: Question, questions: Question[], answers: Answers): string[] {
  if (!q.dependsOnKey) return q.options ?? [];
  const ctrl = controllingQuestion(q, questions);
  const key = ctrl && typeof answers[ctrl.questionId] === "string" ? (answers[ctrl.questionId] as string) : "";
  return (key && q.optionsMap?.[key]) || [];
}

export default function FillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<Form | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [name, setName] = useState("");
  const [agentIds, setAgentIds] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "done">("loading");
  const [mcp, setMcp] = useState(false);

  const answersRef = useRef<Answers>({});
  answersRef.current = answers;
  const nameRef = useRef("");
  nameRef.current = name;
  const formRef = useRef<Form | null>(null);
  formRef.current = form;

  const refresh = useCallback(async () => {
    const res = await api.getForm(id);
    if (res.ok && res.form) { setForm(res.form); setState("ready"); return res.form; }
    setState("notfound");
    return undefined;
  }, [id]);

  useEffect(() => { refresh(); setMcp(webmcpAvailable()); }, [refresh]);

  const setAnswer = (qid: string, v: AnswerValue, byAgent: boolean) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    setAgentIds((s) => {
      const n = new Set(s);
      if (byAgent) n.add(qid); else n.delete(qid);
      return n;
    });
  };

  // When a dependent question's controlling answer changes (e.g. cuisine → mains), drop any
  // previously-picked options that no longer belong to the new set.
  useEffect(() => {
    if (!form) return;
    let changed = false;
    const next = { ...answers };
    for (const q of form.questions) {
      if (!q.dependsOnKey) continue;
      const allowed = resolveOptions(q, form.questions, answers);
      const cur = answers[q.questionId];
      if (Array.isArray(cur)) {
        const kept = cur.filter((x) => allowed.includes(x));
        if (kept.length !== cur.length) { next[q.questionId] = kept; changed = true; }
      } else if (typeof cur === "string" && cur && !allowed.includes(cur)) {
        next[q.questionId] = ""; changed = true;
      }
    }
    if (changed) setAnswers(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, form]);

  function validation(f: Form, a: Answers, nm: string = nameRef.current) {
    const missing: string[] = [];
    const invalid: { questionId: string; reason: string }[] = [];
    for (const q of f.questions) {
      if (elementByKind(q.kind)?.display) continue;
      const v = a[q.questionId];
      const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) { if (q.required) missing.push(q.questionId); continue; }
      const reason = invalidReason(q, v);
      if (reason) invalid.push({ questionId: q.questionId, reason });
    }
    if (f.settings.collectName && !nm.trim()) missing.push("name");
    return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
  }

  // Accepts explicit answers/name so a just-computed batch (not yet reflected in the
  // answers/name refs, which only update on the next render) can be submitted immediately.
  async function doSubmit(overrideAnswers?: Answers, overrideName?: string): Promise<{ ok: boolean; error?: string }> {
    const f = formRef.current;
    if (!f) return { ok: false, error: "not loaded" };
    const a = overrideAnswers ?? answersRef.current;
    const nm = overrideName ?? nameRef.current;
    const answerList = Object.entries(a).map(([questionId, value]) => ({ questionId, value }));
    const res = await api.submitResponse(id, { name: nm || undefined, answers: answerList, sessionId: getSessionId() });
    if (res.ok) { setState("done"); return { ok: true }; }
    return { ok: false, error: res.error?.message ?? "submit failed" };
  }

  // ---- WebMCP responder tools --------------------------------------------
  useWebMCP(() => [
    {
      name: "get_form",
      description: "Read the form you are filling: its questions, their kinds, ids, options, and which are required. Call this first so you fill the right fields with valid values.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const f = formRef.current ?? (await refresh());
        return f ? { ok: true, form: f, collectsName: f.settings.collectName } : { ok: false, error: "not found" };
      },
    },
    {
      name: "fill_field",
      description:
        "Set the answer for one question. value types: text/email/date = string; number/rating/slider = number; single_choice/dropdown/yes_no = one option string ('Yes'/'No' for yes_no); multi_choice = array of option strings.",
      inputSchema: {
        type: "object",
        properties: { questionId: { type: "string" }, value: {} },
        required: ["questionId", "value"],
      },
      execute: async (input) => {
        const f = formRef.current;
        const q = f?.questions.find((x) => x.questionId === input.questionId);
        if (!q) return { ok: false, error: { code: "no_question", message: "No such questionId" } };
        setAnswer(q.questionId, input.value as AnswerValue, true);
        return { ok: true, accepted: true };
      },
    },
    {
      name: "fill_form",
      description:
        "Fill many answers at once (and optionally the respondent's name). answers = [{questionId, value}]. " +
        "This only fills the fields — it never submits. When every required field is filled, call submit_response to submit. " +
        "Returns per-field accept/reject plus whether the form is now valid and what's still missing.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          answers: { type: "array", items: { type: "object", properties: { questionId: { type: "string" }, value: {} }, required: ["questionId", "value"] } },
        },
        required: ["answers"],
      },
      execute: async (input) => {
        const f = formRef.current;
        if (!f) return { ok: false, error: { code: "not_loaded", message: "form not loaded" } };
        const nextName = input.name !== undefined ? String(input.name) : nameRef.current;
        if (input.name !== undefined) setName(nextName);
        const nextAnswers: Answers = { ...answersRef.current };
        const results = ((input.answers as { questionId: string; value: AnswerValue }[]) ?? []).map((a) => {
          const q = f.questions.find((x) => x.questionId === a.questionId);
          if (!q) return { questionId: a.questionId, accepted: false };
          nextAnswers[a.questionId] = a.value;
          setAnswer(a.questionId, a.value, true);
          return { questionId: a.questionId, accepted: true };
        });
        const v = validation(f, nextAnswers, nextName);
        return {
          ok: true, results, submitted: false, valid: v.valid, missing: v.missing,
          next: v.valid ? "All required fields filled — call submit_response to submit." : "Not all required fields are filled yet.",
        };
      },
    },
    {
      name: "get_validation_state",
      description: "Check what is still missing or invalid before submitting. Returns valid and the list of missing questionIds (or 'name').",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const f = formRef.current;
        return f ? { ok: true, ...validation(f, answersRef.current) } : { ok: false, error: "not loaded" };
      },
    },
    {
      name: "submit_response",
      description: "Submit the filled form. Confirms with the user first and shows them the values. Fails if required fields are missing.",
      inputSchema: { type: "object", properties: {} },
      execute: async (_input, client) => {
        const f = formRef.current;
        if (!f) return { ok: false, error: "not loaded" };
        const v = validation(f, answersRef.current);
        if (!v.valid) {
          const parts = [
            v.missing.length ? `missing: ${v.missing.join(", ")}` : "",
            v.invalid.length ? `invalid: ${v.invalid.map((x) => `${x.questionId} (${x.reason})`).join(", ")}` : "",
          ].filter(Boolean);
          return { ok: false, error: { code: "incomplete", message: parts.join("; ") } };
        }
        const ok = await confirmGate(client, `Submit your response to "${f.title}"?`);
        if (!ok) return { ok: false, error: "cancelled by user" };
        const res = await doSubmit();
        return res.ok ? { ok: true, submitted: true } : { ok: false, error: res.error };
      },
    },
  ]);

  if (state === "loading") return <div className="center-note">Loading…</div>;
  if (state === "notfound") return <div className="center-note">This form doesn&apos;t exist. <Link href="/">Make one →</Link></div>;
  if (form && form.status !== "published" && state !== "done")
    return <div className="center-note">This form isn&apos;t open for responses yet.</div>;
  if (state === "done")
    return (
      <div className="center-note done">
        <div className="done-check">✓</div>
        <h2>Response submitted</h2>
        <p className="muted">Thanks{name ? `, ${name}` : ""} — your answers were recorded.</p>
      </div>
    );
  if (!form) return null;

  const v = validation(form, answers);

  return (
    <div className="fill">
      <header className="f-header">
        <Link href="/" className="brand sm"><BrandMark className="brand-mark" /> Fieldset</Link>
        <span className="side-note tiny" style={{ margin: 0 }}>
          <span className={`dot ${mcp ? "on" : ""}`} />
          {mcp ? "agent can fill this" : "manual"}
        </span>
      </header>

      <main className="f-body">
        <h1 className="f-title">{form.title}</h1>
        {form.description && <p className="f-desc">{form.description}</p>}

        {form.settings.collectName && (
          <div className="q-block">
            <label className="q-ask">Your name <span className="req-star">*</span></label>
            <input className={`input ${agentIds.has("name") ? "agent-touched" : ""}`} value={name} placeholder="Type your name…" onChange={(e) => setName(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
        )}

        {form.questions.map((q) => {
          if (q.kind === "section") return <h2 key={q.questionId} className="f-section">{q.label}</h2>;
          if (q.kind === "hidden") return null;
          const def = elementByKind(q.kind);
          // Display-only elements carry their own visual — render the control alone, no question label.
          if (def?.display) {
            return <div key={q.questionId} className="q-block">
              <FieldControl q={q} value={answers[q.questionId]} onChange={(val) => setAnswer(q.questionId, val, false)} agentTouched={agentIds.has(q.questionId)} />
            </div>;
          }
          // Consent renders its own inline label alongside the checkbox.
          if (q.kind === "consent") {
            return <div key={q.questionId} className="q-block">
              <FieldControl q={q} value={answers[q.questionId]} onChange={(val) => setAnswer(q.questionId, val, false)} agentTouched={agentIds.has(q.questionId)} />
            </div>;
          }
          const badReason = v.invalid.find((x) => x.questionId === q.questionId)?.reason;
          // Dependent questions (e.g. mains-by-cuisine) resolve their options from the
          // controlling answer; render the same control, just with the resolved options.
          const eq = q.dependsOnKey ? { ...q, options: resolveOptions(q, form.questions, answers) } : q;
          const awaitingDep = !!q.dependsOnKey && (eq.options?.length ?? 0) === 0;
          const ctrlLabel = q.dependsOnKey ? controllingQuestion(q, form.questions)?.label : undefined;
          return (
            <div key={q.questionId} className="q-block">
              <label className="q-ask">
                {q.label} {q.required && <span className="req-star">*</span>}
                {agentIds.has(q.questionId) && <span className="agent-chip">✎ agent</span>}
                <span className="q-kind-tag mono">{def?.label}</span>
              </label>
              {awaitingDep ? (
                <p className="muted tiny">{ctrlLabel ? `Choose “${ctrlLabel}” first to see options.` : "Make the earlier choice first to see options."}</p>
              ) : (
                <FieldControl q={eq} value={answers[q.questionId]} onChange={(val) => setAnswer(q.questionId, val, false)} agentTouched={agentIds.has(q.questionId)} />
              )}
              {badReason && <p className="field-error">{badReason}</p>}
            </div>
          );
        })}

        <div className="f-submit">
          <button className="btn btn-hl" disabled={!v.valid} onClick={async () => { const r = await doSubmit(); if (!r.ok) requestAlert(String(r.error)); }}>
            Submit response
          </button>
          {!v.valid && (
            <span className="muted tiny">
              {[
                v.missing.length ? `${v.missing.length} required field(s) left` : "",
                v.invalid.length ? `${v.invalid.length} field(s) need fixing` : "",
              ].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
