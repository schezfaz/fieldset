"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { elementByKind } from "@/lib/elements";
import { Aggregate, QuestionSummary } from "@/lib/aggregate";
import { Form, FormResponse, Insight } from "@/lib/types";
import { useWebMCP, webmcpAvailable } from "@/lib/webmcp";

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "notfound">("loading");
  const [mcp, setMcp] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const refresh = useCallback(async () => {
    const [f, r, a, i] = await Promise.all([
      api.getForm(id), api.listResponses(id), api.getAggregate(id), api.listInsights(id),
    ]);
    if (!f.ok || !f.form) { setState("notfound"); return null; }
    setForm(f.form);
    setResponses(r.responses ?? []);
    setAgg(a.ok ? { count: a.count ?? 0, summary: a.summary ?? [] } : null);
    setInsights(i.insights ?? []);
    setState("ready");
    return f.form;
  }, [id]);

  useEffect(() => { refresh(); setMcp(webmcpAvailable()); }, [refresh]);

  const formRef = useRef<Form | null>(null); formRef.current = form;
  const aggRef = useRef<Aggregate | null>(null); aggRef.current = agg;
  const respRef = useRef<FormResponse[]>([]); respRef.current = responses;

  // Turn a response's answers into label→value pairs for readability.
  const readable = useCallback((r: FormResponse) => {
    const f = formRef.current;
    const labelOf = (qid: string) => f?.questions.find((q) => q.questionId === qid)?.label ?? qid;
    return {
      name: r.name ?? null,
      submittedAt: r.submittedAt,
      answers: r.answers.map((a) => ({ question: labelOf(a.questionId), value: a.value })),
    };
  }, []);

  // ---- WebMCP: read the data, then post a conclusion back onto the page ----
  useWebMCP(() => [
    {
      name: "get_summary",
      description: "Read the aggregated results: response count and, per question, either option counts, numeric stats (mean/min/max), or sample text answers. Use this to analyze the form before drawing a conclusion.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const a = await api.getAggregate(id);
        const f = formRef.current;
        return a.ok
          ? { ok: true, title: f?.title, count: a.count ?? 0, summary: a.summary ?? [] }
          : { ok: false, error: "not found" };
      },
    },
    {
      name: "get_responses",
      description: "Read the individual responses (each respondent's name and their answers, labelled by question). Use for qualitative reading; prefer get_summary for counts and stats.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const r = await api.listResponses(id);
        const rows = (r.responses ?? []).map(readable);
        return { ok: true, count: rows.length, responses: rows };
      },
    },
    {
      name: "add_conclusion",
      description: "Post a conclusion or insight drawn from the responses onto the results page, where the organizer sees it. Call this after analyzing with get_summary / get_responses. Keep it to a few sentences.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "The conclusion to display" } },
        required: ["text"],
      },
      execute: async (input) => {
        const text = String(input.text ?? "").trim();
        if (!text) return { ok: false, error: { code: "empty", message: "text is required" } };
        const res = await api.addInsight(id, text, "agent");
        if (res.ok) await refresh();
        return res.ok ? { ok: true } : { ok: false, error: res.error };
      },
    },
  ]);

  if (state === "loading") return <div className="center-note">Loading…</div>;
  if (state === "notfound") return <div className="center-note">This form doesn&apos;t exist. <Link href="/">Make one →</Link></div>;
  if (!form) return null;

  return (
    <div className="fill">
      <header className="f-header">
        <Link href="/" className="brand sm"><span className="brand-mark">▨</span> Fieldset</Link>
        <div className="b-header-right">
          <Link href={`/edit/${id}`} className="btn btn-ghost">Edit form</Link>
          {form.status === "published" && <Link href={`/f/${id}`} className="btn btn-ghost" target="_blank">Fill page ↗</Link>}
          <span className="side-note tiny" style={{ margin: 0 }}>
            <span className={`dot ${mcp ? "on" : ""}`} />
            {mcp ? "agent can analyze this" : "manual"}
          </span>
        </div>
      </header>

      <main className="f-body">
        <p className="eyebrow">Responses</p>
        <h1 className="f-title">{form.title}</h1>
        <p className="f-desc">
          <strong>{responses.length}</strong> response{responses.length === 1 ? "" : "s"}
          {mcp && " · ask your agent to read and summarize them"}
        </p>

        {/* ---- insights (agent conclusions) ---- */}
        <section className="insights">
          <p className="eyebrow">Conclusions</p>
          {insights.length === 0 ? (
            <p className="muted">No conclusions yet. Ask your agent: <em>&ldquo;analyze these responses and add a conclusion.&rdquo;</em></p>
          ) : (
            <ul className="insight-list">
              {insights.map((ins) => (
                <li key={ins.insightId} className={`insight-card ${ins.by === "agent" ? "by-agent" : ""}`}>
                  {ins.by === "agent" && <span className="agent-chip">✎ agent</span>}
                  <p>{ins.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- per-question summary ---- */}
        {responses.length === 0 ? (
          <div className="empty-canvas"><p>No responses yet.</p><p className="muted">Share the fill page and answers will show up here.</p></div>
        ) : (
          <section className="summary">
            {(agg?.summary ?? []).map((s) => <SummaryCard key={s.questionId} s={s} total={responses.length} />)}
          </section>
        )}

        {/* ---- raw responses ---- */}
        {responses.length > 0 && (
          <section className="raw">
            <button className="btn btn-ghost" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide" : "Show"} individual responses ({responses.length})
            </button>
            {showRaw && (
              <ol className="resp-list">
                {responses.map((r) => {
                  const rd = readable(r);
                  return (
                    <li key={r.responseId} className="resp-card">
                      <div className="resp-head mono">{rd.name ?? "Anonymous"} · {new Date(r.submittedAt).toLocaleString()}</div>
                      <dl className="resp-answers">
                        {rd.answers.map((a, i) => (
                          <div key={i} className="resp-answer">
                            <dt>{a.question}</dt>
                            <dd>{Array.isArray(a.value) ? a.value.join(", ") : String(a.value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ s, total }: { s: QuestionSummary; total: number }) {
  const def = elementByKind(s.kind as never);
  return (
    <div className="summary-card">
      <div className="summary-top">
        <span className="summary-label">{s.label}</span>
        <span className="q-kind-tag mono">{def?.label ?? s.kind}</span>
      </div>

      {s.counts && (
        <ul className="bars">
          {Object.entries(s.counts).sort((a, b) => b[1] - a[1]).map(([opt, n]) => (
            <li key={opt} className="bar-row">
              <span className="bar-label">{opt}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
              <span className="bar-count mono">{n}</span>
            </li>
          ))}
        </ul>
      )}

      {s.stats && (
        <div className="stat-row">
          <span><strong>{s.stats.mean}</strong> avg</span>
          <span>{s.stats.min}–{s.stats.max} range</span>
          <span className="muted">{s.stats.count} answered</span>
        </div>
      )}

      {s.samples && (
        <ul className="samples">
          {s.samples.length === 0 ? <li className="muted">No answers</li> : s.samples.map((v, i) => <li key={i}>&ldquo;{v}&rdquo;</li>)}
        </ul>
      )}
    </div>
  );
}
