import { NextRequest, NextResponse } from "next/server";
import { getForm, patchForm } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  // Note: zero questions is allowed — an interview-only form (/i/[id]) starts empty by
  // design; every question is generated live during the interview.
  const origin = req.nextUrl.origin;
  const shareUrl = `${origin}/f/${id}`;
  await patchForm(id, { status: "published", shareUrl });
  return NextResponse.json({ ok: true, status: "published", shareUrl });
}
