import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { storeBatch } from "@/lib/db";
import { MAX_WEB_BODY_BYTES, parseWebBatch } from "@/lib/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public (no ingest token): the Spanish keyboard website forwards its
// counts-only events here. Only the four web_* events are kept.
export async function POST(req: NextRequest) {
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    return NextResponse.json({ error: "content-type" }, { status: 415 });
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_WEB_BODY_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "json" }, { status: 400 });
  }
  const parsed = parseWebBatch(body, randomUUID());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await storeBatch(parsed.batch);
    return NextResponse.json({ ok: true, accepted: parsed.batch.events.length, dropped: parsed.batch.dropped });
  } catch (err) {
    console.error("store failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
