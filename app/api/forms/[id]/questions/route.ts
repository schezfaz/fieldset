import { NextRequest, NextResponse } from "next/server";
import { addQuestion, getForm, removeQuestion, updateQuestion } from "@/lib/store";
import { KIND_ENUM } from "@/lib/elements";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (!KIND_ENUM.includes(b.kind)) {
    return NextResponse.json({ ok: false, error: { code: "bad_kind", message: `kind must be one of ${KIND_ENUM.join(", ")}` } }, { status: 400 });
  }
  const q = await addQuestion(id, {
    kind: b.kind,
    label: typeof b.label === "string" ? b.label : "Untitled question",
    required: !!b.required,
    options: Array.isArray(b.options) ? b.options.map(String) : undefined,
    rows: Array.isArray(b.rows) ? b.rows.map(String) : undefined,
    min: typeof b.min === "number" ? b.min : undefined,
    max: typeof b.max === "number" ? b.max : undefined,
    step: typeof b.step === "number" ? b.step : undefined,
  });
  if (!q) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  return NextResponse.json({ ok: true, questionId: q.questionId, form: await getForm(id) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { questionId, patch } = await req.json().catch(() => ({}));
  const q = await updateQuestion(id, questionId, patch ?? {});
  if (!q) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such question" } }, { status: 404 });
  return NextResponse.json({ ok: true, form: await getForm(id) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { questionId } = await req.json().catch(() => ({}));
  const ok = await removeQuestion(id, questionId);
  if (!ok) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such question" } }, { status: 404 });
  return NextResponse.json({ ok: true, form: await getForm(id) });
}
