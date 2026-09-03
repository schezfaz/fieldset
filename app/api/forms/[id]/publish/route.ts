import { NextRequest, NextResponse } from "next/server";
import { getForm, patchForm } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const form = getForm(id);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  if (form.questions.length === 0) {
    return NextResponse.json({ ok: false, error: { code: "empty", message: "Add at least one question before publishing" } }, { status: 400 });
  }
  const origin = req.nextUrl.origin;
  const shareUrl = `${origin}/f/${id}`;
  patchForm(id, { status: "published", shareUrl });
  return NextResponse.json({ ok: true, status: "published", shareUrl });
}
