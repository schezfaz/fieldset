import { NextRequest, NextResponse } from "next/server";
import { addInsight, getForm, listInsights } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json({ ok: true, insights: await listInsights(id) });
}

// Post a conclusion onto the results page (the agent's analysis, or a human note).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!(await getForm(id))) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: { code: "empty", message: "text is required" } }, { status: 400 });
  const by = b.by === "human" ? "human" : "agent";
  const insight = await addInsight(id, { text, by });
  return NextResponse.json({ ok: true, insight });
}
