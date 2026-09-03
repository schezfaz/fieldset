"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { KIND_ENUM } from "@/lib/elements";
import { confirmGate, useWebMCP, webmcpAvailable } from "@/lib/webmcp";
import { BrandMark } from "@/components/BrandMark";
import { SITE_SAMPLES, type Sample } from "@/lib/samples";

type BuildQuestion = {
  kind: string; label: string; required?: boolean; options?: string[]; min?: number; max?: number; step?: number;
};

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [mcp, setMcp] = useState(false);
  const [seeding, setSeeding] = useState<string | null>(null);

  useEffect(() => setMcp(webmcpAvailable()), []);

  async function create(t: string) {
    const res = await api.createForm({ title: t || "Untitled form" });
    if (res.ok && res.formId) router.push(`/edit/${res.formId}`);
    return res;
  }

  // Spin up one of the ready-made examples: create the form, add every question, publish it,
  // then open its fill page — so it's ready for a human or their agent to fill immediately.
  async function useSample(s: Sample) {
    if (seeding) return;
    setSeeding(s.slug);
    const res = await api.createForm({ title: s.title, description: s.description });
    if (!res.ok || !res.formId) { setSeeding(null); return; }
    for (const q of s.questions) await api.addQuestion(res.formId, q as unknown as Record<string, unknown>);
    await api.publishForm(res.formId);
    router.push(`/f/${res.formId}`);
  }

  // One-shot: create the form AND add every question in a single tool call, then open the
  // builder. Avoids the home→builder tool-rediscovery handoff — the agent does it all here.
  async function buildForm(input: { title: string; description?: string; questions?: BuildQuestion[] }, client?: unknown) {
    const res = await api.createForm({ title: input.title || "Untitled form", description: input.description });
    if (!res.ok || !res.formId) return { ok: false, error: "Could not create form" };
    const id = res.formId;
    let added = 0;
    for (const q of input.questions ?? []) {
      const r = await api.addQuestion(id, q as Record<string, unknown>);
      if (r.ok) added++;
    }
    if (!added) {
      router.push(`/edit/${id}?built=1`);
      return { ok: true, formId: id, editUrl: `/edit/${id}`, added, next: "No questions added — use add_question on the builder." };
    }
    // Form is fully built — go straight to the publish confirm gate rather than making the
    // agent come back with a second publish_form call.
    const confirmed = await confirmGate(client, `Publish "${input.title}" with ${added} question(s)?`);
    if (!confirmed) {
      router.push(`/edit/${id}?built=1`);
      return { ok: true, formId: id, editUrl: `/edit/${id}`, added, published: false, next: "Form built but not published (cancelled). Call publish_form on the builder when ready." };
    }
    const pub = await api.publishForm(id);
    router.push(`/edit/${id}?built=1`);
    return {
      ok: true, formId: id, editUrl: `/edit/${id}`, added,
      published: pub.ok, shareUrl: pub.shareUrl,
      next: pub.ok ? "Form built and published." : "Form built but publish failed — call publish_form on the builder.",
    };
  }

  useWebMCP(() => [
    {
      name: "build_form",
      description:
        "Build a COMPLETE form in one call from a goal (e.g. 'a form to collect feedback on my presentation'): creates the form, sets the title, and adds every question at once. Prefer this over create_form whenever you already know what to ask. kinds: " +
        KIND_ENUM.join(", ") +
        ". Give options[] for single_choice/multi_choice/dropdown, min/max (and step) for rating/slider, and use kind 'section' for a header.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "The form title" },
          description: { type: "string", description: "Optional subtitle shown to respondents" },
          questions: {
            type: "array",
            description: "Every question to add, in order",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: KIND_ENUM },
                label: { type: "string", description: "The question text" },
                required: { type: "boolean" },
                options: { type: "array", items: { type: "string" } },
                min: { type: "number" }, max: { type: "number" }, step: { type: "number" },
              },
              required: ["kind", "label"],
            },
          },
        },
        required: ["title", "questions"],
      },
      execute: async (input, client) =>
        buildForm(input as { title: string; description?: string; questions?: BuildQuestion[] }, client),
    },
    {
      name: "create_form",
      description:
        "Create a new form and open its builder. Use this first, then add questions with add_question on the builder page.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "The form's title" },
          description: { type: "string", description: "Optional subtitle shown to respondents" },
        },
        required: ["title"],
      },
      execute: async (input) => {
        const res = await create(String(input.title ?? "Untitled form"));
        return res.ok
          ? { ok: true, formId: res.formId, editUrl: `/edit/${res.formId}`, next: "Now add questions with add_question." }
          : { ok: false, error: "Could not create form" };
      },
    },
  ]);

  return (
    <main className="home">
      <div className="home-inner">
        <div className="brand">
          <BrandMark className="brand-mark" /> Fieldset
        </div>

        <p className="eyebrow">Agent-native forms</p>
        <h1 className="home-h1">
          forms you and your agent <mark className="mark-hl">build</mark> and <mark className="mark-hl">fill</mark> together.
        </h1>
        <p className="home-sub">
          Start here, or hand it off to your agent — with shared controls, you both work on the
          same canvas. Everything the agent touches is{" "}
          <span className="ink-hl">highlighted</span>, so you always see who did what. Share the link,
          with another human — or agent!
        </p>

        <div className="card home-card">
          <label className="field-label">Form title</label>
          <input
            className="input"
            placeholder="e.g. Team lunch order, Q3 customer survey…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create(title)}
          />
          <button className="btn btn-primary home-cta" style={{ marginTop: 16 }} onClick={() => create(title)}>
            Create form →
          </button>
        </div>

        <div className="home-samples">
          <p className="home-samples-label">Or try a ready-made form — fill it yourself, or hand it to your agent</p>
          <div className="home-samples-grid">
            {SITE_SAMPLES.map((s) => (
              <button
                key={s.slug}
                className="sample-card"
                onClick={() => useSample(s)}
                disabled={!!seeding}
              >
                <span className="sample-glyph" aria-hidden>{s.glyph}</span>
                <span className="sample-title">{s.title}</span>
                <span className="sample-desc">{s.description}</span>
                <span className="sample-cta">
                  {seeding === s.slug ? "Opening…" : `${s.questions.length} questions · Fill →`}
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="mcp-status">
          <span className={`dot ${mcp ? "on" : ""}`} />
          {mcp
            ? "WebMCP detected — your agent can build right alongside you."
            : "WebMCP not detected — you can still build manually. Enable chrome://flags/#enable-webmcp-testing to build with your agent."}
        </p>
      </div>
    </main>
  );
}
