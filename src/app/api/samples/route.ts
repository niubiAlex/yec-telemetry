import { NextRequest, NextResponse } from "next/server";
import { MAX_SAMPLE_BODY_BYTES, parseSamples } from "@/lib/samples";
import { purgeSamples, storeSamples } from "@/lib/db";
import { readClientJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same status codes as /api/events: 2xx done · 400/413/415 drop · 401 keep · else retry.
export async function POST(req: NextRequest) {
  const read = await readClientJson(req, MAX_SAMPLE_BODY_BYTES);
  if ("error" in read) return read.error;
  const parsed = parseSamples(read.body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if ("discarded" in parsed) {
    return NextResponse.json({ ok: true, accepted: 0, discarded: parsed.discarded, dropped: parsed.count });
  }
  const { samples, rejected } = parsed.batch;
  try {
    const accepted = await storeSamples(parsed.batch);
    // The daily cron does this too; running it here keeps retention even if a cron run is missed.
    await purgeSamples().catch((err) => console.error("purge failed", err));
    return NextResponse.json({ ok: true, accepted, filtered: rejected.filtered, invalid: rejected.invalid, received: samples.length + rejected.filtered + rejected.invalid });
  } catch (err) {
    console.error("store samples failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
