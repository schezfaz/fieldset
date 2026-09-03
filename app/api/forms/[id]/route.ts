import { NextRequest, NextResponse } from "next/server";
import { getForm, patchForm } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const form = getForm(id);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  return NextResponse.json({ ok: true, form });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const form = patchForm(id, body);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  return NextResponse.json({ ok: true, form });
}
