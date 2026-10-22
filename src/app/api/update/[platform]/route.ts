import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/db";
import { checkManifest, docName, type Platform } from "@/lib/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/update/mac, /api/update/windows; ?channel=test for test machines.
export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const name = docName(params.platform as Platform, req.nextUrl.searchParams.get("channel") ?? "stable");
  if (!name) return NextResponse.json({ error: "unknown platform or channel" }, { status: 404 });
  try {
    const doc = await getDoc(name);
    const checked = doc ? checkManifest(doc.body) : null;
    if (!checked?.ok) {
      return NextResponse.json({ error: "no release" }, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    }
    return NextResponse.json(checked.value, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    console.error("manifest read failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
