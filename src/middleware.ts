import { NextRequest, NextResponse } from "next/server";
import { basicPassword, safeEqual } from "@/lib/auth";

// The dashboard (/dashboard, /users) is behind Basic auth. The client
// endpoints (ingest, samples, 打字明细 upload, web events, remote config,
// update manifests, installer downloads) and the token-checked admin endpoint
// are not matched here. They only take data in; reading 打字明细 is the /users
// pages, which stay behind it. The public homepage is `/` and its files
// under /home/.
export const config = {
  matcher: ["/((?!api/events|api/samples|api/typing|api/web|api/config|api/update|api/admin|api/try|dl/|home/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};

/** The dashboard used to live at `/`; these are its query parameters. */
const DASHBOARD_PARAMS = ["product", "range", "platform", "active", "cohort", "day", "rc"];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
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
  if (given !== null && safeEqual(given, password)) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="yec-telemetry", charset="UTF-8"' },
  });
}
