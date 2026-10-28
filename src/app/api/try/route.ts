import { NextRequest, NextResponse } from "next/server";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE, allow, newVisitorCookie, verifyVisitorCookie } from "@/lib/try/limit";
import { available, translate } from "@/lib/try/model";
import { MAX_INPUT, preset, type TryReply } from "@/lib/try/presets";
import { isChinese, isToneKey } from "@/lib/try/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The homepage try-it box. The typed text is used for this one request and is
// never logged or stored; errors are logged by kind only.
export async function POST(req: NextRequest) {
  let body: { text?: unknown; tone?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  const { text, tone } = body;
  if (typeof text !== "string" || !isToneKey(tone)) return NextResponse.json({ error: "input" }, { status: 400 });
  const chinese = text.trim();
  if (!chinese || [...chinese].length > MAX_INPUT) return NextResponse.json({ error: "input" }, { status: 400 });

  const visitor = verifyVisitorCookie(req.cookies.get(VISITOR_COOKIE)?.value);
  const reply = (r: TryReply) => {
    const res = NextResponse.json(r, { headers: { "cache-control": "no-store" } });
    if (!visitor) {
      res.cookies.set(VISITOR_COOKIE, newVisitorCookie(), {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
        path: "/api/try", maxAge: VISITOR_COOKIE_MAX_AGE,
      });
    }
    return res;
  };

  // Built-in examples need no model call and do not count against the limit.
  const example = preset(chinese);
  if (example) return reply({ source: "example", result: example.result });
  if (!isChinese(chinese)) return reply({ source: "not_chinese" });

  try {
    if (!(await available())) return reply({ source: "error" });
  } catch (err) {
    console.error("try: config read failed", err instanceof Error ? err.message : "unknown");
    return reply({ source: "error" });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.ip || "unknown";
  try {
    if ((await allow(ip, visitor)) !== "ok") return reply({ source: "limited" });
  } catch (err) {
    console.error("try: limit check failed", err instanceof Error ? err.message : "unknown");
    return reply({ source: "error" });
  }
  try {
    const result = await translate(chinese, tone);
    return reply(result ? { source: "model", result } : { source: "empty" });
  } catch (err) {
    console.error("try: translate failed", err instanceof Error ? err.message : "unknown");
    return reply({ source: "error" });
  }
}
