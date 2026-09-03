import { NextRequest, NextResponse } from "next/server";
import { getForm, listResponses } from "@/lib/store";
import { aggregate } from "@/lib/aggregate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const form = getForm(id);
  if (!form) return NextResponse.json({ ok: false, error: { code: "not_found", message: "No such form" } }, { status: 404 });
  return NextResponse.json({ ok: true, ...aggregate(form, listResponses(id)) });
}
