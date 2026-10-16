import { NextRequest, NextResponse } from "next/server";
import { basicPassword, safeEqual } from "@/lib/auth";

// The dashboard is behind Basic auth. Ingest is not matched here.
export const config = { matcher: ["/((?!api/events|_next/static|favicon.ico).*)"] };

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return new NextResponse("DASHBOARD_PASSWORD is not set", { status: 503 });
  const given = basicPassword(req.headers.get("authorization"));
  if (given !== null && safeEqual(given, password)) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="yec-telemetry", charset="UTF-8"' },
  });
}
