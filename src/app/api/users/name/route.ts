import { NextRequest, NextResponse } from "next/server";
import { cleanName, isDeviceId, setName } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sets a device's 备注名 from the 用户 pages. The middleware puts this behind the
// dashboard's Basic auth. Browsers resend Basic credentials on cross-site
// requests too, so the form must also come from this site.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let sameSite = req.headers.get("sec-fetch-site") === "same-origin";
  if (origin) {
    try { sameSite = new URL(origin).host === host; } catch { sameSite = false; }
  }
  if (!sameSite) return NextResponse.json({ error: "cross-site" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const deviceId = form?.get("device_id");
  const name = cleanName(form?.get("name"));
  if (!isDeviceId(deviceId)) return NextResponse.json({ error: "device_id" }, { status: 400 });
  if (name === null) return NextResponse.json({ error: "name" }, { status: 400 });
  try {
    await setName(deviceId.toLowerCase(), name);
  } catch (err) {
    console.error("set name failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const back = form?.get("back");
  const to = typeof back === "string" && /^\/users(?:[/?#]|$)/.test(back) ? back : "/users";
  return NextResponse.redirect(new URL(to, req.url), 303);
}
