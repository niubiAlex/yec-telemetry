import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { HIT_KEY_HEADER, serviceKey, serviceToken } from "@/lib/hits";
import { RANGES } from "@/lib/stats";
import { loadEnglishStats } from "@/lib/webstats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// english.ltd's /dashboard reads its counts here, with the service key; it
// checks its own password first. Counts only.
export async function GET(req: NextRequest) {
  const token = serviceToken();
  const key = req.headers.get(HIT_KEY_HEADER);
  if (!token || !key || !safeEqual(key, await serviceKey(token))) return new NextResponse(null, { status: 404 });
  const asked = Number(req.nextUrl.searchParams.get("days"));
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 7;
  try {
    return NextResponse.json(await loadEnglishStats(days), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("web-stats", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "db" }, { status: 503 });
  }
}
