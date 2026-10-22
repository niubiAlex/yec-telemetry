import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/db";
import { safeEqual } from "@/lib/auth";
import { checkConfig, forClient } from "@/lib/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The clients fetch this at launch and every few hours. The gateway key is
// only included for a request that carries the ingest token the installers
// ship (REMOTE_CONFIG_TOKEN holds the same value); without it the rest of the
// config is still served.
export async function GET(req: NextRequest) {
  const token = process.env.REMOTE_CONFIG_TOKEN;
  const withKey = !!token && safeEqual(req.headers.get("x-ingest-token") ?? "", token);
  try {
    const doc = await getDoc("config");
    if (!doc) return NextResponse.json({ error: "no config" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const checked = checkConfig(doc.body);
    if (!checked.ok) {
      console.error("stored config is invalid", checked.error);
      return NextResponse.json({ error: "no config" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(forClient(checked.value, withKey), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("config read failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
