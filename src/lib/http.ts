import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "./auth";

/** The client's JSON body, or the error response to send instead. */
export async function readClientJson(req: NextRequest, maxBytes: number): Promise<{ body: unknown } | { error: NextResponse }> {
  const token = process.env.INGEST_TOKEN;
  if (token && !safeEqual(req.headers.get("x-ingest-token") ?? "", token)) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    return { error: NextResponse.json({ error: "content-type" }, { status: 415 }) };
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw) > maxBytes) return { error: NextResponse.json({ error: "too large" }, { status: 413 }) };
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { error: NextResponse.json({ error: "json" }, { status: 400 }) };
  }
}
