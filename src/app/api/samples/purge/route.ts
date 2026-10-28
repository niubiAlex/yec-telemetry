import { NextRequest, NextResponse } from "next/server";
import { purgeSamples, purgeTyping } from "@/lib/db";
import { safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily Vercel cron (vercel.json). It only deletes samples and 打字明细
// already past their 90 days, so without CRON_SECRET it is left open.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const deleted = await purgeSamples();
    return NextResponse.json({ ok: true, deleted, typing_deleted: await purgeTyping() });
  } catch (err) {
    console.error("purge samples failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
