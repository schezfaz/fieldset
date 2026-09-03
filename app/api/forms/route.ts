import { NextRequest, NextResponse } from "next/server";
import { createForm } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled form";
  const description = typeof body.description === "string" ? body.description : undefined;
  const form = createForm({ title, description });
  return NextResponse.json({ ok: true, formId: form.formId, form });
}
