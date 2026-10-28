import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { HIT_KEY_HEADER, STAFF_COOKIE, hitKey, hitSecret, isBot, isBrowser, parseDownload, parseHit, type Hit } from "@/lib/hits";
import { clientIp, recordHit } from "@/lib/webstats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2048;
const done = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });

// Homepage stats. The page posts its own hits here; the middleware posts
// installer downloads with the shared key and the downloader's IP and UA.
// Always 204, so a rejected hit looks like any other.
export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return done();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return done(); }

  const secret = hitSecret();
  const key = req.headers.get(HIT_KEY_HEADER);
  if (key) {
    if (!secret || !safeEqual(key, await hitKey(secret))) return done();
    const dl = parseDownload(String((body as { path?: unknown })?.path ?? ""));
    if (!dl) return done();
    const ua = req.headers.get("x-hit-ua") ?? "";
    const hit: Hit = { name: "download", props: { ...dl, client: isBrowser(ua) ? "browser" : "app" } };
    await recordHit(hit, req.headers.get("x-hit-ip") ?? "unknown", ua);
    return done();
  }

  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || isBot(ua) || req.cookies.has(STAFF_COOKIE)) return done();
  const hit = parseHit(body);
  if (hit) await recordHit(hit, clientIp(req), ua);
  return done();
}
