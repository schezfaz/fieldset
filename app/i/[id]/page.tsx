"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { elementByKind, KIND_ENUM } from "@/lib/elements";
import { AnswerValue, Form, InterviewTurn, QuestionKind } from "@/lib/types";
import { FieldControl } from "@/components/FieldControl";
import { confirmGate, useWebMCP, webmcpAvailable } from "@/lib/webmcp";
import { getSessionId } from "@/lib/session";

// Kinds offered on the manual "ask a question" control — a curated subset of the full
// palette, enough to demo every answer-rendering path without a cluttered picker.
const ASKABLE_KINDS: QuestionKind[] = [
  "short_text", "long_text", "email", "number",
  "single_choice", "multi_choice", "yes_no", "rating", "date",
];

let turnSeq = 0;
const nextTurnId = () => `it_${++turnSeq}_${Math.random().toString(36).slice(2, 6)}`;

export default function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<Form | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "done">("loading");
  const [mcp, setMcp] = useState(false);
  const [askLabel, setAskLabel] = useState("");
  const [askKind, setAskKind] = useState<QuestionKind>("short_text");
  const [askOptions, setAskOptions] = useState("");

  const turnsRef = useRef<InterviewTurn[]>([]);
  turnsRef.current = turns;
  const nameRef = useRef("");
  nameRef.current = name;
  const formRef = useRef<Form | null>(null);
  formRef.current = form;

  const refresh = useCallback(async () => {
    const res = await api.getForm(id);
    if (res.ok && res.form) { setForm(res.form); setState((s) => (s === "done" ? s : "ready")); return res.form; }
    setState("notfound");
    return undefined;
  }, [id]);

  useEffect(() => { refresh(); setMcp(webmcpAvailable()); }, [refresh]);

  const addTurn = (q: { kind: QuestionKind; label: string; required?: boolean; options?: string[]; min?: number; max?: number }, askedBy: "agent" | "human") => {
    const turn: InterviewTurn = {
      questionId: nextTurnId(),
      kind: q.kind,
      label: q.label,
      required: q.required ?? true,
      options: q.options,
      min: q.min,
      max: q.max,
      askedBy,
    };
    setTurns((t) => [...t, turn]);
    return turn;
  };

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setTurns((t) => t.map((x) => (x.questionId === questionId ? { ...x, answer: value } : x)));
  };

  function validation(list: InterviewTurn[]) {
    const missing = list.filter((t) => t.required && (t.answer === undefined || t.answer === "" || (Array.isArray(t.answer) && t.answer.length === 0))).map((t) => t.questionId);
    const f = formRef.current;
    if (f?.settings.collectName && !nameRef.current.trim()) missing.push("name");
    return { valid: missing.length === 0, missing };
  }

  async function doFinish(): Promise<{ ok: boolean; error?: string }> {
    const f = formRef.current;
    if (!f) return { ok: false, error: "not loaded" };
    const list = turnsRef.current;
    const v = validation(list);
    if (!v.valid) return { ok: false, error: `Missing answers: ${v.missing.join(", ")}` };
    const answers = list.filter((t) => t.answer !== undefined).map((t) => ({ questionId: t.questionId, value: t.answer! }));
    const res = await api.submitResponse(id, { name: nameRef.current || undefined, answers, sessionId: getSessionId() });
    if (res.ok) { setState("done"); return { ok: true }; }
    return { ok: false, error: res.error?.message ?? "could not finish" };
  }

  // ---- WebMCP interview tools ---------------------------------------------
  // The agent runs a loop here rather than filling a fixed form: read state, decide
  // the next question from what's been answered so far, ask it, wait for the answer,
  // repeat, then finish. Every tool has a visible human equivalent below (the manual
  // "ask a question" row and the "Finish interview" button) — dual control, same as
  // the builder and fill pages.
  useWebMCP(() => [
    {
      name: "get_interview_state",
      description: "Read the interview so far: the form's title/description, and every question asked (kind, label, options, required) with its answer if given yet. Use this to decide what to ask next.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const f = formRef.current ?? (await refresh());
        return f
          ? { ok: true, title: f.title, description: f.description, turns: turnsRef.current, finished: state === "done" }
          : { ok: false, error: "not found" };
      },
    },
    {
      name: "ask_question",
      description: `Append the next question you decided on; it renders immediately for the human to answer. kind one of: ${KIND_ENUM.join(", ")}. options required for single_choice/multi_choice/dropdown. min/max for number/rating.`,
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string" },
          label: { type: "string" },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" } },
          min: { type: "number" },
          max: { type: "number" },
        },
        required: ["kind", "label"],
      },
      execute: async (input) => {
        const label = String(input.label ?? "").trim();
        if (!label) return { ok: false, error: { code: "empty_label", message: "label is required" } };
        const kind = (KIND_ENUM as string[]).includes(String(input.kind)) ? (input.kind as QuestionKind) : "short_text";
        const turn = addTurn({
          kind, label,
          required: input.required as boolean | undefined,
          options: Array.isArray(input.options) ? (input.options as string[]) : undefined,
          min: typeof input.min === "number" ? input.min : undefined,
          max: typeof input.max === "number" ? input.max : undefined,
        }, "agent");
        return { ok: true, questionId: turn.questionId };
      },
    },
    {
      name: "fill_field",
      description: "Record the human's answer to a question already asked in this interview (by questionId from get_interview_state or ask_question).",
      inputSchema: {
        type: "object",
        properties: { questionId: { type: "string" }, value: {} },
        required: ["questionId", "value"],
      },
      execute: async (input) => {
        const exists = turnsRef.current.some((t) => t.questionId === input.questionId);
        if (!exists) return { ok: false, error: { code: "no_question", message: "No such questionId in this interview" } };
        setAnswer(String(input.questionId), input.value as AnswerValue);
        return { ok: true, accepted: true };
      },
    },
    {
      name: "finish_interview",
      description: "Stop the interview and submit it as a normal response. Confirms with the user first and shows them the transcript. Fails if a required question is still unanswered.",
      inputSchema: { type: "object", properties: {} },
      execute: async (_input, client) => {
        const v = validation(turnsRef.current);
        if (!v.valid) return { ok: false, error: { code: "incomplete", message: `Missing: ${v.missing.join(", ")}` } };
        const f = formRef.current;
        const ok = await confirmGate(client, `Finish the interview for "${f?.title ?? "this form"}" and submit ${turnsRef.current.length} answer(s)?`);
        if (!ok) return { ok: false, error: "cancelled by user" };
        const res = await doFinish();
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
        <h2>Interview finished</h2>
        <p className="muted">Thanks{name ? `, ${name}` : ""} — your {turns.filter((t) => t.answer !== undefined).length} answer(s) were recorded.</p>
      </div>
    );
  if (!form) return null;

  const v = validation(turns);
  const pendingTurn = turns.find((t) => t.answer === undefined);

  const submitManualAsk = () => {
    const label = askLabel.trim();
    if (!label) return;
    const needsOptions = elementByKind(askKind)?.hasOptions;
    const options = needsOptions ? askOptions.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    addTurn({ kind: askKind, label, options }, "human");
    setAskLabel(""); setAskOptions("");
  };

  return (
    <div className="fill interview">
      <header className="f-header">
        <Link href="/" className="brand sm"><span className="brand-mark">▨</span> Fieldset</Link>
        <div className="b-header-right">
          <Link href={`/f/${id}`} className="btn btn-ghost">Regular fill page →</Link>
          <span className="side-note tiny" style={{ margin: 0 }}>
            <span className={`dot ${mcp ? "on" : ""}`} />
            {mcp ? "agent is interviewing" : "manual"}
          </span>
        </div>
      </header>

      <main className="f-body">
        <p className="eyebrow">Interview</p>
        <h1 className="f-title">{form.title}</h1>
        {form.description && <p className="f-desc">{form.description}</p>}
        <p className="muted tiny">Questions appear one at a time, decided live — by your agent, or manually below.</p>

        {form.settings.collectName && (
          <div className="q-block">
            <label className="q-ask">Your name <span className="req-star">*</span></label>
            <input className="input" value={name} placeholder="Type your name…" onChange={(e) => setName(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
        )}

        {turns.length === 0 && (
          <div className="empty-canvas"><p>No questions yet.</p><p className="muted">Ask your agent to start the interview, or add the first question manually below.</p></div>
        )}

        <ol className="turn-list">
          {turns.map((t) => {
            const def = elementByKind(t.kind);
            const answered = t.answer !== undefined;
            const isPending = t.questionId === pendingTurn?.questionId;
            return (
              <li key={t.questionId} className={`turn-card ${answered ? "answered" : "pending"}`}>
                <div className="turn-q">
                  <span>{t.label} {t.required && <span className="req-star">*</span>}</span>
                  {t.askedBy === "agent" && <span className="agent-chip">✎ agent asked</span>}
                  <span className="q-kind-tag mono">{def?.label}</span>
                </div>
                {answered ? (
                  <div className="turn-a">{Array.isArray(t.answer) ? t.answer.join(", ") : String(t.answer)}</div>
                ) : isPending ? (
                  <FieldControl
                    q={{ questionId: t.questionId, kind: t.kind, label: t.label, required: t.required, options: t.options, min: t.min, max: t.max }}
                    value={t.answer}
                    onChange={(val) => setAnswer(t.questionId, val)}
                  />
                ) : (
                  <div className="turn-a muted tiny">— not answered —</div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="ask-row">
          <input className="input" value={askLabel} placeholder="Ask a question manually…" onChange={(e) => setAskLabel(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select className="select" value={askKind} onChange={(e) => setAskKind(e.target.value as QuestionKind)}>
            {ASKABLE_KINDS.map((k) => <option key={k} value={k}>{elementByKind(k)?.label}</option>)}
          </select>
          {elementByKind(askKind)?.hasOptions && (
            <input className="input" value={askOptions} placeholder="Options, comma separated" onChange={(e) => setAskOptions(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          )}
          <button className="btn btn-ghost" onClick={submitManualAsk} disabled={!askLabel.trim()}>+ Ask</button>
        </div>

        <div className="f-submit">
          <button className="btn btn-hl" disabled={!v.valid || turns.length === 0} onClick={async () => { const r = await doFinish(); if (!r.ok) alert(r.error); }}>
            Finish interview
          </button>
          {!v.valid && turns.length > 0 && <span className="muted tiny">{v.missing.length} required answer(s) left</span>}
        </div>
      </main>
    </div>
  );
}
