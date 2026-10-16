import { NextRequest, NextResponse } from "next/server";
import { MAX_BODY_BYTES, parseBatch } from "@/lib/schema";
import { storeBatch } from "@/lib/db";
import { safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status codes follow the client (Telemetry.swift send):
//   2xx done · 400/413/415 drop the batch · 401 keep it · anything else retry.
export async function POST(req: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  if (token && !safeEqual(req.headers.get("x-ingest-token") ?? "", token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    return NextResponse.json({ error: "content-type" }, { status: 415 });
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "json" }, { status: 400 });
  }

  const parsed = parseBatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { duplicate } = await storeBatch(parsed.batch);
    return NextResponse.json({
      ok: true,
      duplicate,
      accepted: duplicate ? 0 : parsed.batch.events.length,
      dropped: parsed.batch.dropped,
    });
  } catch (err) {
    console.error("store failed", err);
    // 503: the client keeps the batch and resends it under the same id.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
