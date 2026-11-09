import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/db";
import { PACKAGE_FORMATS, checkManifest, dmgDocName, docName, pickRelease, type Manifest, type Platform } from "@/lib/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/update/mac, /api/update/windows; ?channel=test for test machines.
// ?formats=dmg,tgz (Mac clients from 0.2.8.1) may get update-mac-dmg instead,
// when its format is one they listed and it is at least as new; older
// clients never ask, so never see a package.
export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const q = req.nextUrl.searchParams;
  const channel = q.get("channel") ?? "stable";
  const name = docName(params.platform as Platform, channel);
  if (!name) return NextResponse.json({ error: "unknown platform or channel" }, { status: 404 });
  const formats = q.get("formats");
  const asksPackage = (formats ?? "").split(",").some((f) => (PACKAGE_FORMATS as readonly string[]).includes(f));
  const pkgName = asksPackage ? dmgDocName(params.platform, channel) : null;
  try {
    const read = async (doc: string, kind: "zip" | "dmg"): Promise<Manifest | null> => {
      const d = await getDoc(doc);
      const checked = d ? checkManifest(d.body, kind) : null;
      return checked?.ok ? checked.value : null;
    };
    const zip = await read(name, "zip");
    const pkg = pkgName ? await read(pkgName, "dmg") : null;
    const best = pickRelease(zip, pkg, formats);
    if (!best) {
      return NextResponse.json({ error: "no release" }, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    }
    return NextResponse.json(best, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    console.error("manifest read failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
