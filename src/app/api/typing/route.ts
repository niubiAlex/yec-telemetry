import { NextRequest, NextResponse } from "next/server";
import { MAX_TYPING_BODY_BYTES, parseTyping } from "@/lib/typing";
import { purgeTyping, storeTyping } from "@/lib/db";
import { readClientJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 打字明细. Same status codes as /api/events: 2xx done · 400/413/415 drop · 401 keep · else retry.
export async function POST(req: NextRequest) {
  const read = await readClientJson(req, MAX_TYPING_BODY_BYTES);
  if ("error" in read) return read.error;
  const parsed = parseTyping(read.body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if ("discarded" in parsed) {
    return NextResponse.json({ ok: true, accepted: 0, discarded: parsed.discarded, dropped: parsed.count });
  }
  const { records, rejected } = parsed.batch;
  try {
    const accepted = await storeTyping(parsed.batch);
    // The daily cron does this too; running it here keeps retention even if a cron run is missed.
    await purgeTyping().catch((err) => console.error("purge typing failed", err));
    return NextResponse.json({ ok: true, accepted, filtered: rejected.filtered, invalid: rejected.invalid,
      received: records.length + rejected.filtered + rejected.invalid });
  } catch (err) {
    console.error("store typing failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
