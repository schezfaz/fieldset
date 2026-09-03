import { NextRequest, NextResponse } from "next/server";
import { addResponse, getForm, hasSessionResponded, listResponses } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const responses = listResponses(id);
  return NextResponse.json({ ok: true, responses, count: responses.length });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const form = getForm(id);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  if (form.status !== "published") {
    return NextResponse.json({ ok: false, error: { code: "not_open", message: "This form is not accepting responses" } }, { status: 400 });
  }

  const b = await req.json().catch(() => ({}));
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : undefined;

  if (form.settings.oneResponsePerPerson && sessionId && hasSessionResponded(id, sessionId)) {
    return NextResponse.json({ ok: false, error: { code: "already_submitted", message: "You've already responded to this form" } }, { status: 409 });
  }

  // Validate required questions are answered.
  const answers = Array.isArray(b.answers) ? b.answers : [];
  const answered = new Set(answers.map((a: { questionId: string }) => a.questionId));
  const missing = form.questions.filter((q) => q.required && q.kind !== "section" && !answered.has(q.questionId)).map((q) => q.questionId);
  if (missing.length) {
    return NextResponse.json({ ok: false, error: { code: "missing_required", message: `Missing required: ${missing.join(", ")}` } }, { status: 400 });
  }

  const response = addResponse(id, { name: b.name, answers, sessionId });
  return NextResponse.json({ ok: true, responseId: response!.responseId });
}
