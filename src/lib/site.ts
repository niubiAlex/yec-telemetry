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

export const macPkgPath = (version: string) => `mac/${version}/YoudaoCopilotIME-${version}.pkg`;

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

async function blobSize(path: string): Promise<number | null> {
  try {
    const res = await fetch(`${BLOB_BASE}/${path}`, { method: "HEAD", next: { revalidate: 300 } });
    if (!res.ok) return null;
    const n = Number(res.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
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
  filename: `有道AI输入法-Mac-${version}.pkg`,
  size,
});

export async function windowsDownload(): Promise<Download | null> {
  const m = await manifest("windows");
  if (!m) return null;
  const href = m.urls.map(dlPath).find((p): p is string => p !== null);
  if (!href) return null;
  return { version: m.version, href, filename: `有道AI输入法-Windows-${m.version}.exe`, size: m.size };
}

export const megabytes = (n: number | null) => (n ? `${Math.round(n / 1e6)} MB` : "");
