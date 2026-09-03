"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { elementByKind } from "@/lib/elements";
import { AnswerValue, Form } from "@/lib/types";
import { FieldControl } from "@/components/FieldControl";
import { confirmGate, useWebMCP, webmcpAvailable } from "@/lib/webmcp";

type Answers = Record<string, AnswerValue>;

function sessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let s = localStorage.getItem("fieldset_sid");
    if (!s) { s = crypto.randomUUID(); localStorage.setItem("fieldset_sid", s); }
    return s;
  } catch { return "anon"; }
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

  function validation(f: Form, a: Answers) {
    const missing = f.questions
      .filter((q) => q.required && !elementByKind(q.kind)?.display)
      .filter((q) => { const v = a[q.questionId]; return v === undefined || v === "" || (Array.isArray(v) && v.length === 0); })
      .map((q) => q.questionId);
    if (f.settings.collectName && !nameRef.current.trim()) missing.push("name");
    return { valid: missing.length === 0, missing };
  }

  async function doSubmit(): Promise<{ ok: boolean; error?: string }> {
    const f = formRef.current;
    if (!f) return { ok: false, error: "not loaded" };
    const answerList = Object.entries(answersRef.current).map(([questionId, value]) => ({ questionId, value }));
    const res = await api.submitResponse(id, { name: nameRef.current || undefined, answers: answerList, sessionId: sessionId() });
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
      description: "Fill many answers at once (and optionally the respondent's name). answers = [{questionId, value}]. Returns per-field accept/reject.",
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
        if (input.name) setName(String(input.name));
        const results = ((input.answers as { questionId: string; value: AnswerValue }[]) ?? []).map((a) => {
          const q = f?.questions.find((x) => x.questionId === a.questionId);
          if (!q) return { questionId: a.questionId, accepted: false };
          setAnswer(q.questionId, a.value, true);
          return { questionId: a.questionId, accepted: true };
        });
        return { ok: true, results };
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
        if (!v.valid) return { ok: false, error: { code: "incomplete", message: `Missing: ${v.missing.join(", ")}` } };
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
        <Link href="/" className="brand sm"><span className="brand-mark">▨</span> Fieldset</Link>
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
          return (
            <div key={q.questionId} className="q-block">
              <label className="q-ask">
                {q.label} {q.required && <span className="req-star">*</span>}
                {agentIds.has(q.questionId) && <span className="agent-chip">✎ agent</span>}
                <span className="q-kind-tag mono">{def?.label}</span>
              </label>
              <FieldControl q={q} value={answers[q.questionId]} onChange={(val) => setAnswer(q.questionId, val, false)} agentTouched={agentIds.has(q.questionId)} />
            </div>
          );
        })}

        <div className="f-submit">
          <button className="btn btn-hl" disabled={!v.valid} onClick={async () => { const r = await doSubmit(); if (!r.ok) alert(r.error); }}>
            Submit response
          </button>
          {!v.valid && <span className="muted tiny">{v.missing.length} required field(s) left</span>}
        </div>
      </main>
    </div>
  );
}
