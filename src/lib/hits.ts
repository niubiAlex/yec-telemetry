// Homepage stats (site = yec_web). Edge-safe: the middleware uses this too.
// A visitor is a hash of IP + user agent + the Beijing day under a server
// secret, so the same person is a new visitor every day and neither the IP nor
// the hash input is stored. No cookie identifies a visitor; STAFF_COOKIE only
// marks a browser that opened the dashboard, so its homepage traffic is skipped.

export const SITE = "yec_web";
export const STAFF_COOKIE = "yec_staff";
export const HIT_KEY_HEADER = "x-hit-key";

/** Events the page itself may send, and the props each may carry. */
export const PUBLIC_HITS = {
  view: ["ref", "utm_source", "utm_medium", "utm_campaign"],
  video_play: ["video"],
  join_view: [],
  join_click: ["from"],
  download_click: ["platform"],
  try: ["source"],
} as const;
export type PublicHit = keyof typeof PUBLIC_HITS;
export type HitName = PublicHit | "download";

export interface Hit { name: HitName; props: Record<string, string> }

const BOT = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|preview|fetch|scan|monitor|uptime|pingdom|curl|wget|python|httpie|axios|node-fetch|go-http|java\/|okhttp|libwww|facebookexternalhit|embedly|whatsapp|telegram|slack|discord|skype/i;

/** Obvious bots: crawlers, link previewers, monitors, scripts. */
export const isBot = (ua: string) => BOT.test(ua);

/** Browsers send Mozilla/…; the apps' updaters do not. */
export const isBrowser = (ua: string) => ua.startsWith("Mozilla/");

export const device = (ua: string) => (/Mobi|Android|iPhone|iPad|iPod|HarmonyOS/i.test(ua) ? "mobile" : "desktop");

/** Beijing calendar day, YYYY-MM-DD. */
export const beijingDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

const TOKEN = /^[\w.+-][\w .+-]{0,59}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const PROP_VALUE: Record<string, RegExp> = {
  video: /^[a-z]{1,20}$/,
  from: /^[a-z_]{1,20}$/,
  platform: /^(mac|windows)$/,
  source: /^(example|model|limited|not_chinese|empty|error)$/,
  utm_source: TOKEN, utm_medium: TOKEN, utm_campaign: TOKEN,
};

/** A page-sent hit with only known props and well-formed values, or null. */
export function parseHit(body: unknown): Hit | null {
  if (!body || typeof body !== "object") return null;
  const { name, props } = body as { name?: unknown; props?: unknown };
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(PUBLIC_HITS, name)) return null;
  const allowed: readonly string[] = PUBLIC_HITS[name as PublicHit];
  const out: Record<string, string> = {};
  if (props !== undefined && (props === null || typeof props !== "object" || Array.isArray(props))) return null;
  for (const [k, v] of Object.entries((props ?? {}) as Record<string, unknown>)) {
    if (!allowed.includes(k) || typeof v !== "string" || v === "") continue;
    if (k === "ref") {
      const h = v.toLowerCase().replace(/^www\./, "");
      if (h.length <= 100 && HOST.test(h)) out.ref = h;
    } else if (PROP_VALUE[k]?.test(v)) {
      out[k] = v.trim();
    }
  }
  return { name: name as PublicHit, props: out };
}

/** An installer or update under /dl/ (not the homepage videos): platform, version and file type. */
export function parseDownload(pathname: string): { platform: string; version: string; file: string; path: string } | null {
  const m = /^\/dl\/(mac|windows)\/(\d+(?:\.\d+){1,3})\/[\w.-]+\.(pkg|dmg|zip|exe|msi)$/.exec(pathname);
  return m ? { platform: m[1], version: m[2], file: m[3], path: pathname.slice(4) } : null;
}

/** A GET from the first byte: a new download, not a resumed or chunked one. */
export const firstRequest = (method: string, range: string | null) =>
  method === "GET" && (!range || /^bytes=0-/.test(range.trim()));

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** The secret the visitor hash and the middleware key are salted with; no extra env var needed. */
export const hitSecret = () => process.env.HIT_SALT || process.env.DASHBOARD_PASSWORD || "";

/** Shared by the middleware and /api/hit, so server-side download hits can be told from page ones. */
export const hitKey = (secret: string) => sha256(`yec-hit-key:${secret}`);

/** The day's visitor id: not reversible without the secret, and different every day. */
export const visitorId = async (secret: string, day: string, ip: string, ua: string) =>
  (await sha256(`yec-visitor:${secret}:${day}:${ip}:${ua}`)).slice(0, 24);
