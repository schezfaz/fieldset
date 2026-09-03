"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { KIND_ENUM, elementByKind, elementsByGroup } from "@/lib/elements";
import { Form, Question, QuestionKind } from "@/lib/types";
import { FieldControl } from "@/components/FieldControl";
import { confirmGate, useWebMCP, webmcpAvailable } from "@/lib/webmcp";

export default function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<Form | null>(null);
  const [agentIds, setAgentIds] = useState<Set<string>>(new Set());
  const [notFound, setNotFound] = useState(false);
  const [mcp, setMcp] = useState(false);
  const [published, setPublished] = useState<{ title: string; url: string } | null>(null);
  const formRef = useRef<Form | null>(null);
  formRef.current = form;

  const refresh = useCallback(async () => {
    const res = await api.getForm(id);
    if (res.ok && res.form) setForm(res.form);
    else setNotFound(true);
    return res.form;
  }, [id]);

  useEffect(() => {
    (async () => {
      const f = await refresh();
      // If we arrived from an agent's one-shot build_form (?built=1), show every seeded
      // question as agent-authored so the belly-blue provenance is visible on arrival.
      const built = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("built") === "1";
      if (f && built) setAgentIds(new Set(f.questions.map((q) => q.questionId)));
    })();
    setMcp(webmcpAvailable());
  }, [refresh]);

  const markAgent = (qid: string) => setAgentIds((s) => new Set(s).add(qid));
  const unmarkAgent = (qid: string) => setAgentIds((s) => { const n = new Set(s); n.delete(qid); return n; });

  // ---- WebMCP builder tools ----------------------------------------------
  useWebMCP(() => [
    {
      name: "get_form_schema",
      description: "Read the current form: title, type, settings, and the full ordered list of questions with their ids. Call this before editing so you know the structure.",
      annotations: { readOnlyHint: true },
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const f = await refresh();
        return f ? { ok: true, form: f } : { ok: false, error: "not found" };
      },
    },
    {
      name: "add_question",
      description:
        "Add one question to the form. kind is one of: " + KIND_ENUM.join(", ") +
        ". Provide options[] for single_choice, multi_choice, dropdown, multi_dropdown, ranking, and matrix (columns); rows[] for matrix. Use min/max for rating, slider, opinion_scale, nps, currency (and step for slider). Use kind 'section'/'statement'/'page_break'/'image'/'video'/'hidden' for non-answerable layout elements (for image/video pass the source URL as options[0]); price for payment. Returns the new questionId.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: KIND_ENUM },
          label: { type: "string", description: "The question text" },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" }, description: "Choices for choice/dropdown kinds; matrix columns; media URL as options[0]" },
          rows: { type: "array", items: { type: "string" }, description: "Row labels for matrix" },
          min: { type: "number" }, max: { type: "number" }, step: { type: "number" }, price: { type: "number" },
        },
        required: ["kind", "label"],
      },
      execute: async (input) => {
        const res = await api.addQuestion(id, input);
        if (res.ok && res.form) { setForm(res.form); if (res.questionId) markAgent(res.questionId); }
        return res.ok ? { ok: true, questionId: res.questionId } : { ok: false, error: res };
      },
    },
    {
      name: "update_question",
      description: "Change fields on an existing question (label, required, options, min, max, step). Pass questionId plus only the fields to change.",
      inputSchema: {
        type: "object",
        properties: {
          questionId: { type: "string" },
          label: { type: "string" }, required: { type: "boolean" },
          options: { type: "array", items: { type: "string" } },
          min: { type: "number" }, max: { type: "number" }, step: { type: "number" },
        },
        required: ["questionId"],
      },
      execute: async (input) => {
        const { questionId, ...patch } = input as { questionId: string };
        const res = await api.updateQuestion(id, questionId, patch);
        if (res.ok && res.form) { setForm(res.form); markAgent(questionId); }
        return res.ok ? { ok: true } : { ok: false, error: res };
      },
    },
    {
      name: "remove_question",
      description: "Delete a question by its questionId.",
      inputSchema: { type: "object", properties: { questionId: { type: "string" } }, required: ["questionId"] },
      execute: async (input) => {
        const res = await api.removeQuestion(id, String(input.questionId));
        if (res.ok && res.form) setForm(res.form);
        return res.ok ? { ok: true } : { ok: false, error: res };
      },
    },
    {
      name: "reorder_questions",
      description: "Reorder every question. Pass 'order' as the full list of questionIds in the new order.",
      inputSchema: { type: "object", properties: { order: { type: "array", items: { type: "string" } } }, required: ["order"] },
      execute: async (input) => {
        const res = await api.reorderQuestions(id, (input.order as string[]) ?? []);
        if (res.ok && res.form) setForm(res.form);
        return res.ok ? { ok: true } : { ok: false, error: res };
      },
    },
    {
      name: "set_form_details",
      description: "Set the form's title and/or description.",
      inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } } },
      execute: async (input) => {
        const res = await api.patchForm(id, input);
        if (res.ok && res.form) setForm(res.form);
        return res.ok ? { ok: true } : { ok: false, error: res };
      },
    },
    {
      name: "configure_settings",
      description: "Configure form settings: deadline (ISO 8601), oneResponsePerPerson (bool), anonymous (bool), collectName (bool, adds a name field for respondents).",
      inputSchema: {
        type: "object",
        properties: {
          deadline: { type: "string" }, oneResponsePerPerson: { type: "boolean" },
          anonymous: { type: "boolean" }, collectName: { type: "boolean" },
        },
      },
      execute: async (input) => {
        const res = await api.patchForm(id, { settings: input });
        if (res.ok && res.form) setForm(res.form);
        return res.ok ? { ok: true, settings: res.form?.settings } : { ok: false, error: res };
      },
    },
    {
      name: "publish_form",
      description: "Validate and publish the form. Confirms with the user first, then returns the shareable URL respondents (and their agents) use.",
      inputSchema: { type: "object", properties: {} },
      execute: async (_input, client) => {
        const f = formRef.current;
        const ok = await confirmGate(client, `Publish "${f?.title}" with ${f?.questions.length ?? 0} question(s)?`);
        if (!ok) return { ok: false, error: "cancelled by user" };
        const res = await api.publishForm(id);
        if (res.ok) {
          await refresh();
          if (res.shareUrl) setPublished({ title: f?.title ?? "", url: res.shareUrl });
        }
        return res.ok ? { ok: true, shareUrl: res.shareUrl } : { ok: false, error: res };
      },
    },
  ]);

  // ---- manual (human) actions --------------------------------------------
  async function addManual(kind: QuestionKind) {
    const def = elementByKind(kind)!;
    const res = await api.addQuestion(id, { kind, ...def.defaults() });
    if (res.ok && res.form) setForm(res.form);
  }
  async function patchQuestion(qid: string, patch: Partial<Question>) {
    unmarkAgent(qid); // human edit → becomes "ink"
    const res = await api.updateQuestion(id, qid, patch);
    if (res.ok && res.form) setForm(res.form);
  }
  async function del(qid: string) {
    const res = await api.removeQuestion(id, qid);
    if (res.ok && res.form) setForm(res.form);
  }
  async function move(qid: string, dir: -1 | 1) {
    if (!form) return;
    const ids = form.questions.map((q) => q.questionId);
    const i = ids.indexOf(qid);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const res = await api.reorderQuestions(id, ids);
    if (res.ok && res.form) setForm(res.form);
  }
  async function publish() {
    if (!confirm(`Publish "${form?.title}"?`)) return;
    const res = await api.publishForm(id);
    if (res.ok) {
      refresh();
      if (res.shareUrl) setPublished({ title: form?.title ?? "", url: res.shareUrl });
    } else {
      alert("Add at least one question first.");
    }
  }

  if (notFound) return <div className="center-note">Form not found. <Link href="/">Start a new one →</Link></div>;
  if (!form) return <div className="center-note">Loading…</div>;

  return (
    <div className="builder">
      <header className="b-header">
        <Link href="/" className="brand sm"><span className="brand-mark">▨</span> Fieldset</Link>
        <div className="b-header-right">
          <span className={`status-pill ${form.status}`}>{form.status}</span>
          {form.status === "published" && form.shareUrl && (
            <Link href={`/f/${id}`} className="btn btn-ghost" target="_blank">Open fill page ↗</Link>
          )}
          <Link href={`/r/${id}`} className="btn btn-ghost">Responses →</Link>
          <button className="btn btn-hl" onClick={publish}>Publish</button>
        </div>
      </header>

      <div className="b-body">
        {/* main canvas */}
        <main className="b-canvas">
          <input
            className="title-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onBlur={(e) => api.patchForm(id, { title: e.target.value })}
          />
          <input
            className="desc-input"
            placeholder="Add a description…"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            onBlur={(e) => api.patchForm(id, { description: e.target.value })}
          />

          {form.questions.length === 0 && (
            <div className="empty-canvas">
              <p>No questions yet.</p>
              <p className="muted">Add elements from the right — or ask your agent: <em>&ldquo;add a 5-star rating and a comment box.&rdquo;</em></p>
            </div>
          )}

          <ol className="q-list">
            {form.questions.map((q, i) => (
              <QuestionCard
                key={q.questionId}
                q={q} index={i} total={form.questions.length}
                agent={agentIds.has(q.questionId)}
                onPatch={(p) => patchQuestion(q.questionId, p)}
                onDelete={() => del(q.questionId)}
                onMove={(d) => move(q.questionId, d)}
              />
            ))}
          </ol>
        </main>

        {/* palette + info */}
        <aside className="b-side">
          <div className="side-block">
            <p className="eyebrow">Add element</p>
            <div className="palette-groups">
              {elementsByGroup().map(({ group, items }, gi) => (
                <details key={group} className="palette-group" open={gi === 0}>
                  <summary className="palette-summary">
                    <span className="palette-caret" aria-hidden>▸</span>
                    {group}
                    <span className="palette-count mono">{items.length}</span>
                  </summary>
                  <div className="palette">
                    {items.map((e) => (
                      <button key={e.kind} className="palette-btn" onClick={() => addManual(e.kind)} title={e.label}>
                        <span className="palette-glyph mono">{e.glyph}</span>
                        {e.label}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="side-block">
            <p className="eyebrow">Agent</p>
            <p className="side-note">
              <span className={`dot ${mcp ? "on" : ""}`} />
              {mcp ? "Connected. Ask it to build questions — its edits show up highlighted." : "Not detected. Enable the WebMCP flag to let an agent build this form."}
            </p>
            <p className="side-note mono tiny">
              tools: add_question · update_question · remove_question · reorder_questions · configure_settings · publish_form
            </p>
          </div>
        </aside>
      </div>

      {published && (
        <PublishModal title={published.title} url={published.url} onClose={() => setPublished(null)} />
      )}
    </div>
  );
}

function PublishModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  }

  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  async function nativeShare() {
    try { await navigator.share({ title, url }); } catch { /* user cancelled */ }
  }

  const shareText = encodeURIComponent(`Fill out "${title}"`);
  const encodedUrl = encodeURIComponent(url);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="done-check modal-check">✓</div>
        <h2 className="modal-title">&ldquo;{title}&rdquo; published</h2>
        <p className="modal-sub">Here&rsquo;s the link — share it however people will find it.</p>

        <div className="modal-link-row">
          <input
            className="input modal-link-input mono"
            value={url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button className="btn btn-primary" onClick={copyLink}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>

        <div className="modal-share-row">
          {canShare && <button className="btn btn-ghost" onClick={nativeShare}>Share…</button>}
          <a className="btn btn-ghost" href={`mailto:?subject=${shareText}&body=${encodedUrl}`}>Email</a>
          <a
            className="btn btn-ghost"
            href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on X
          </a>
          <a href={url} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">Open fill page ↗</a>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  q, index, total, agent, onPatch, onDelete, onMove,
}: {
  q: Question; index: number; total: number; agent: boolean;
  onPatch: (p: Partial<Question>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void;
}) {
  const def = elementByKind(q.kind);
  const isSection = q.kind === "section";
  const isDisplay = !!def?.display;
  return (
    <li className={`q-card ${agent ? "agent-touched" : ""} ${isSection ? "is-section" : ""}`}>
      {agent && <span className="agent-mark" />}
      <div className="q-top">
        <span className="q-kind mono">{def?.glyph} {def?.label}</span>
        <div className="q-actions">
          <button className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</button>
          <button className="icon-btn" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down">↓</button>
          {!isDisplay && (
            <label className="req-toggle" title="Required">
              <input type="checkbox" checked={q.required} onChange={(e) => onPatch({ required: e.target.checked })} /> req
            </label>
          )}
          <button className="icon-btn danger" onClick={onDelete} aria-label="Delete">✕</button>
        </div>
      </div>

      <input
        className={isSection ? "q-section-input" : "q-label-input"}
        value={q.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        placeholder={isSection ? "Section title" : "Question"}
      />

      <QuestionConfig q={q} def={def} onPatch={onPatch} />
    </li>
  );
}

// Per-kind configuration + live preview shown under each question in the builder.
function QuestionConfig({
  q, def, onPatch,
}: {
  q: Question; def: ReturnType<typeof elementByKind>; onPatch: (p: Partial<Question>) => void;
}) {
  const isSection = q.kind === "section";
  const isMedia = q.kind === "image" || q.kind === "video";

  return (
    <>
      {/* matrix rows (columns handled by the options editor below) */}
      {def?.hasRows && (
        <>
          <p className="cfg-label mono">Rows</p>
          <OptionsEditor kind="single_choice" options={q.rows ?? []} onChange={(rows) => onPatch({ rows })} noun="Row" />
          <p className="cfg-label mono">Columns</p>
        </>
      )}

      {/* image / video source URL */}
      {isMedia ? (
        <div className="cfg-row">
          <label className="cfg-field wide">
            <span className="cfg-label mono">{q.kind === "image" ? "Image URL" : "Video URL"}</span>
            <input
              className="input"
              value={q.options?.[0] ?? ""}
              placeholder="https://…"
              onChange={(e) => onPatch({ options: [e.target.value] })}
            />
          </label>
        </div>
      ) : def?.hasOptions ? (
        <OptionsEditor kind={q.kind} options={q.options ?? []} onChange={(options) => onPatch({ options })} />
      ) : null}

      {/* numeric ranges — editable min / max / step */}
      {q.kind === "slider" && (
        <RangeEditor q={q} onPatch={onPatch} fields={["min", "max", "step"]} />
      )}
      {q.kind === "opinion_scale" && (
        <RangeEditor q={q} onPatch={onPatch} fields={["min", "max"]} />
      )}
      {q.kind === "rating" && (
        <RangeEditor q={q} onPatch={onPatch} fields={["max"]} labels={{ max: "Stars" }} />
      )}
      {q.kind === "currency" && (
        <RangeEditor q={q} onPatch={onPatch} fields={["min", "max"]} labels={{ min: "Min", max: "Max" }} />
      )}
      {q.kind === "payment" && (
        <RangeEditor q={q} onPatch={onPatch} fields={["price"]} labels={{ price: "Amount ($)" }} />
      )}

      {/* live preview — everything except a bare section header */}
      {!isSection && (
        <div className="q-preview">
          <FieldControl q={q} value={undefined} onChange={() => {}} disabled />
        </div>
      )}
    </>
  );
}

// Compact numeric-config editor: renders an editable box per requested field.
function RangeEditor({
  q, onPatch, fields, labels = {},
}: {
  q: Question;
  onPatch: (p: Partial<Question>) => void;
  fields: ("min" | "max" | "step" | "price")[];
  labels?: Partial<Record<"min" | "max" | "step" | "price", string>>;
}) {
  const cap = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
  return (
    <div className="cfg-row">
      {fields.map((f) => (
        <label key={f} className="cfg-field">
          <span className="cfg-label mono">{labels[f] ?? cap(f)}</span>
          <input
            className="input cfg-num"
            type="number"
            value={q[f] === undefined ? "" : String(q[f])}
            onChange={(e) => onPatch({ [f]: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}

// Inline option editor: edit each option's label right where it's shown, no raw textarea.
function OptionsEditor({
  kind, options, onChange, noun = "Option",
}: {
  kind: Question["kind"]; options: string[]; onChange: (options: string[]) => void; noun?: string;
}) {
  const glyph = kind === "multi_choice" ? "▢" : kind === "ranking" ? "≡" : kind === "matrix" ? "▥" : "◯";
  const set = (i: number, val: string) => onChange(options.map((o, idx) => (idx === i ? val : o)));
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  const add = () => onChange([...options, `${noun} ${options.length + 1}`]);
  return (
    <div className="opt-editor">
      {options.map((opt, i) => (
        <div key={i} className="opt-row">
          <span className="opt-glyph" aria-hidden>{glyph}</span>
          <input
            className="opt-input"
            value={opt}
            onChange={(e) => set(i, e.target.value)}
            placeholder={`${noun} ${i + 1}`}
          />
          <button className="icon-btn danger" onClick={() => remove(i)} aria-label={`Remove ${noun.toLowerCase()}`} disabled={options.length <= 1}>✕</button>
        </div>
      ))}
      <button className="opt-add" onClick={add}>+ Add {noun.toLowerCase()}</button>
    </div>
  );
}
