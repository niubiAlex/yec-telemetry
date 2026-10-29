import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import {
  EN_HITS, EN_SITE, HIT_KEY_HEADER, STAFF_COOKIE, hitKey, hitSecret, isBot, isBrowser, parseDownload, parseHit,
  serviceKey, serviceToken, type Hit,
} from "@/lib/hits";
import { clientIp, recordHit } from "@/lib/webstats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;
const MAX_FORWARDED = 20;
const done = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });

// Website stats. The yec homepage posts its own hits here; the middleware
// posts installer downloads, and english.ltd's server posts its pages' hits,
// each with a key and the visitor's IP and UA in headers.
// Always 204, so a rejected hit looks like any other.
export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return done();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return done(); }

  const key = req.headers.get(HIT_KEY_HEADER);
  if (key) {
    const ip = req.headers.get("x-hit-ip") ?? "unknown";
    const ua = req.headers.get("x-hit-ua") ?? "";
    const secret = hitSecret();
    if (secret && safeEqual(key, await hitKey(secret))) {
      const dl = parseDownload(String((body as { path?: unknown })?.path ?? ""));
      if (!dl) return done();
      const { site, ...props } = dl;
      await recordHit({ name: "download", props: { ...props, client: isBrowser(ua) ? "browser" : "app" } }, ip, ua, site);
      return done();
    }
    const token = serviceToken();
    if (!token || !safeEqual(key, await serviceKey(token)) || !ua || isBot(ua)) return done();
    const hits = (body as { hits?: unknown })?.hits;
    if (!Array.isArray(hits)) return done();
    for (const h of hits.slice(0, MAX_FORWARDED)) {
      const hit = parseHit(h, EN_HITS);
      if (hit) await recordHit(hit, ip, ua, EN_SITE);
    }
    return done();
  }

  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || isBot(ua) || req.cookies.has(STAFF_COOKIE)) return done();
  const hit: Hit | null = parseHit(body);
  if (hit) await recordHit(hit, clientIp(req), ua);
  return done();
}
