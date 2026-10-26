import { NextRequest, NextResponse } from "next/server";
import { parseDeviceId } from "@/lib/samples";
import { deleteDeviceSamples } from "@/lib/db";
import { readClientJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 删除我上传的内容. The device id is a random UUID only that device knows.
export async function POST(req: NextRequest) {
  const read = await readClientJson(req, 1024);
  if ("error" in read) return read.error;
  const deviceId = parseDeviceId(read.body);
  if (!deviceId) return NextResponse.json({ error: "device_id" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, deleted: await deleteDeviceSamples(deviceId) });
  } catch (err) {
    console.error("delete samples failed", err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
