import { NextRequest, NextResponse } from "next/server";
import { getForm, reorderQuestions } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { order } = await req.json().catch(() => ({}));
  if (!Array.isArray(order) || !(await reorderQuestions(id, order.map(String)))) {
    return NextResponse.json({ ok: false, error: { code: "bad_order", message: "order must list every existing questionId once" } }, { status: 400 });
  }
  return NextResponse.json({ ok: true, form: await getForm(id) });
}
