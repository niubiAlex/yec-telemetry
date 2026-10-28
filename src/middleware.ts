import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { basicPassword, safeEqual } from "@/lib/auth";
import { HIT_KEY_HEADER, STAFF_COOKIE, firstRequest, hitKey, hitSecret, isBot, parseDownload } from "@/lib/hits";

// The dashboard (/dashboard, /users) is behind Basic auth. The client
// endpoints (ingest, samples, 打字明细 upload, web events, homepage stats,
// remote config, update manifests) and the token-checked admin endpoint
// are not matched here. They only take data in; reading 打字明细 is the /users
// pages, which stay behind it. The public homepage is `/` and its files
// under /home/. Installer downloads (/dl/) pass through and are counted.
export const config = {
  matcher: ["/((?!api/events|api/samples|api/typing|api/web|api/hit|api/config|api/update|api/admin|api/try|home/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};

/** The dashboard used to live at `/`; these are its query parameters. */
const DASHBOARD_PARAMS = ["product", "range", "platform", "active", "cohort", "day", "rc"];

export function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/dl/")) {
    countDownload(req, event);
    return NextResponse.next();
  }
  if (pathname === "/") {
    if (DASHBOARD_PARAMS.some((p) => searchParams.has(p))) {
      const to = req.nextUrl.clone();
      to.pathname = "/dashboard";
      return NextResponse.redirect(to, 308);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return new NextResponse("DASHBOARD_PASSWORD is not set", { status: 503 });
  const given = basicPassword(req.headers.get("authorization"));
  if (given !== null && safeEqual(given, password)) {
    const res = NextResponse.next();
    // Marks this browser as ours so the homepage stats skip it; it carries no id.
    if (!req.cookies.has(STAFF_COOKIE)) {
      res.cookies.set(STAFF_COOKIE, "1", { path: "/", maxAge: 400 * 86_400, sameSite: "lax", secure: true, httpOnly: true });
    }
    return res;
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="yec-telemetry", charset="UTF-8"' },
  });
}

/** Installer and update downloads, after the response is on its way; the file itself is not touched. */
function countDownload(req: NextRequest, event: NextFetchEvent) {
  const secret = hitSecret();
  const ua = req.headers.get("user-agent") ?? "";
  if (!secret || !parseDownload(req.nextUrl.pathname) || !firstRequest(req.method, req.headers.get("range"))) return;
  if (isBot(ua) || req.cookies.has(STAFF_COOKIE)) return;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.ip || "unknown";
  event.waitUntil(
    hitKey(secret)
      .then((key) => fetch(new URL("/api/hit", req.nextUrl.origin), {
        method: "POST",
        headers: { "content-type": "application/json", [HIT_KEY_HEADER]: key, "x-hit-ip": ip, "x-hit-ua": ua },
        body: JSON.stringify({ path: req.nextUrl.pathname }),
      }))
      .then(() => undefined, () => undefined),
  );
}
