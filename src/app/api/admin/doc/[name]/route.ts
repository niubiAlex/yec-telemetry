import { NextRequest, NextResponse } from "next/server";
import { getDoc, putDoc } from "@/lib/db";
import { safeEqual } from "@/lib/auth";
import { MAX_DOC_BYTES, checkDoc } from "@/lib/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publishing only (Scripts/publish-*.sh): `Authorization: Bearer <ADMIN_TOKEN>`.
// Without ADMIN_TOKEN set nothing can be written.
function authorized(req: NextRequest): boolean {
  const token = process.env.ADMIN_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  return !!token && header.startsWith("Bearer ") && safeEqual(header.slice(7), token);
}

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const doc = await getDoc(params.name);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  return NextResponse.json({ body: doc.body, updatedAt: doc.updatedAt }, { headers: noStore });
}

export async function PUT(req: NextRequest, { params }: { params: { name: string } }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_DOC_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "json" }, { status: 400 });
  }
  const checked = checkDoc(params.name, body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400, headers: noStore });
  await putDoc(params.name, checked.value);
  return NextResponse.json({ ok: true, name: params.name }, { headers: noStore });
}
