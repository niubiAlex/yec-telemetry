import https from "node:https";
import { getDoc } from "./db";
import { checkManifest, docName, type Manifest } from "./remote";

// The homepage's download buttons. Windows links the installer the update
// manifest names. The Mac manifest names the .app zip the in-app updater
// installs, so the button links the .pkg uploaded next to it
// (publish-update.sh mac … --pkg), or MAC_PKG_FALLBACK's when that version
// has none. Links go through /dl/, which is reachable from mainland China.

export const BLOB_BASE = "https://rs0hfs39m2puj2ay.public.blob.vercel-storage.com";
/** The newest Mac version known to have an installer .pkg on Blob. */
export const MAC_PKG_FALLBACK = "0.2.6";

export interface Download {
  version: string;
  /** Same-origin /dl/ path, so `download` can name the file. */
  href: string;
  /** What the browser saves it as. */
  filename: string;
  size: number | null;
}

/** Up to 0.2.7 the installer was uploaded as YoudaoCopilotIME-<v>.pkg; Blob names the saved file after the path. */
export const macPkgPath = (version: string) =>
  newer(version, "0.2.7") ? `mac/${version}/KeyLingo-Mac-${version}.pkg` : `mac/${version}/YoudaoCopilotIME-${version}.pkg`;

/** The /dl/ path of a manifest URL on our domain or the Blob host, or null. */
export function dlPath(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin === BLOB_BASE) return `/dl${u.pathname}`;
  if (u.pathname.startsWith("/dl/")) return u.pathname;
  return null;
}

async function manifest(platform: "mac" | "windows"): Promise<Manifest | null> {
  try {
    const doc = await getDoc(docName(platform) as string);
    const checked = doc ? checkManifest(doc.body) : null;
    return checked?.ok ? checked.value : null;
  } catch (err) {
    console.error(`homepage: ${platform} manifest unavailable`, err);
    return null;
  }
}

/** Node's https, not fetch: through Next's patched fetch this HEAD came back without a usable size. */
function blobSize(path: string): Promise<number | null> {
  return new Promise((resolve) => {
    const req = https.request(`${BLOB_BASE}/${path}`, { method: "HEAD", timeout: 5000 }, (res) => {
      res.resume();
      const n = Number(res.headers["content-length"]);
      resolve(res.statusCode === 200 && Number.isFinite(n) && n > 0 ? n : null);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

export async function macDownload(): Promise<Download> {
  const m = await manifest("mac");
  if (m) {
    const size = await blobSize(macPkgPath(m.version));
    if (size) return macLink(m.version, size);
  }
  return macLink(MAC_PKG_FALLBACK, await blobSize(macPkgPath(MAC_PKG_FALLBACK)));
}

const macLink = (version: string, size: number | null): Download => ({
  version,
  href: `/dl/${macPkgPath(version)}`,
  filename: `KeyLingo-Mac-${version}.pkg`,
  size,
});

export async function windowsDownload(): Promise<Download | null> {
  const m = await manifest("windows");
  if (!m) return null;
  const href = m.urls.map(dlPath).find((p): p is string => p !== null);
  if (!href) return null;
  return { version: m.version, href, filename: `KeyLingo-Windows-${m.version}.exe`, size: m.size };
}

export const megabytes = (n: number | null) => (n ? `${Math.round(n / 1e6)} MB` : "");

/** a > b for dotted version numbers. */
export function newer(a: string, b: string): boolean {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** The last releases whose input menu still says 「有道 AI 输入法」; the next ones say KeyLingo. */
export const LAST_OLD_NAME = { mac: "0.2.7", windows: "0.2.7" };

/** Whether both offered installers already carry the new name. */
export const renamed = (mac: Download | null, win: Download | null) =>
  !!mac && !!win && newer(mac.version, LAST_OLD_NAME.mac) && newer(win.version, LAST_OLD_NAME.windows);
