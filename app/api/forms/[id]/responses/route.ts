import { NextRequest, NextResponse } from "next/server";
import { addResponse, getForm, hasSessionResponded, listResponses } from "@/lib/store";
import { elementByKind } from "@/lib/elements";
import { invalidReason } from "@/lib/validate";
import { AnswerValue } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const responses = await listResponses(id);
  return NextResponse.json({ ok: true, responses, count: responses.length });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  if (form.status !== "published") {
    return NextResponse.json({ ok: false, error: { code: "not_open", message: "This form is not accepting responses" } }, { status: 400 });
  }

  const b = await req.json().catch(() => ({}));
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : undefined;

  if (form.settings.oneResponsePerPerson && sessionId && (await hasSessionResponded(id, sessionId))) {
    return NextResponse.json({ ok: false, error: { code: "already_submitted", message: "You've already responded to this form" } }, { status: 409 });
  }

  const answers: { questionId: string; value: AnswerValue }[] = Array.isArray(b.answers) ? b.answers : [];
  const answerByQid = new Map(answers.map((a) => [a.questionId, a.value]));

  // Validate required questions are answered — a question that renders no input at all
  // (section/statement/page_break/image/video/hidden) can never satisfy "required", so it
  // must never block submission the way it silently could before.
  const missing = form.questions
    .filter((q) => q.required && !elementByKind(q.kind)?.display && !answerByQid.has(q.questionId))
    .map((q) => q.questionId);
  if (missing.length) {
    return NextResponse.json({ ok: false, error: { code: "missing_required", message: `Missing required: ${missing.join(", ")}` } }, { status: 400 });
  }

  // Validate format/range for whatever was answered (email, phone, url, numeric ranges).
  // Server-side, in addition to the client checks, since fill_field/fill_form let an agent
  // set a value directly without going through the input's own constraints.
  const invalid = form.questions
    .filter((q) => answerByQid.has(q.questionId))
    .map((q) => ({ questionId: q.questionId, reason: invalidReason(q, answerByQid.get(q.questionId)!) }))
    .filter((x): x is { questionId: string; reason: string } => !!x.reason);
  if (invalid.length) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_format", message: invalid.map((x) => `${x.questionId}: ${x.reason}`).join("; ") } },
      { status: 400 },
    );
  }

  const response = await addResponse(id, { name: b.name, answers, sessionId });
  return NextResponse.json({ ok: true, responseId: response!.responseId });
}
