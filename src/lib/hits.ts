// Website stats: the yec homepage (site = yec_web) and english.ltd (site =
// english_ltd, forwarded by its server). Edge-safe: the middleware uses this too.
// A visitor is a hash of IP + user agent + the Beijing day under a server
// secret, so the same person is a new visitor every day and neither the IP nor
// the hash input is stored. No cookie identifies a visitor; STAFF_COOKIE only
// marks a browser that opened the dashboard, so its homepage traffic is skipped.

export const SITE = "yec_web";
export const EN_SITE = "english_ltd";
export type Site = typeof SITE | typeof EN_SITE;
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

/** What english.ltd's server forwards: its page events (already counted as es_en_web) and its rate-limit refusals. */
export const EN_HITS = {
  view: ["path", "lang", "ref", "utm_source", "utm_medium", "utm_campaign"],
  translate: ["lang", "mode", "result"],
  card_accepted: ["lang", "mode", "tone"],
  download_click: ["lang", "platform"],
  limit_hit: ["by"],
} as const;
export type EnHit = keyof typeof EN_HITS;
export type HitName = PublicHit | EnHit | "download";

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
  path: /^\/[a-z0-9/-]{0,100}$/,
  lang: /^(en|es)$/,
  mode: /^(en_es|es_en|en_en)$/,
  result: /^(model|mock|limited|error)$/,
  tone: /^(casual|work|formal)$/,
  by: /^(visitor|ip|site)$/,
  utm_source: TOKEN, utm_medium: TOKEN, utm_campaign: TOKEN,
};

/** A hit with only the names and props `table` allows and well-formed values, or null. */
export function parseHit(body: unknown, table: Record<string, readonly string[]> = PUBLIC_HITS): Hit | null {
  if (!body || typeof body !== "object") return null;
  const { name, props } = body as { name?: unknown; props?: unknown };
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(table, name)) return null;
  const allowed = table[name];
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
  return { name: name as HitName, props: out };
}

/**
 * An installer or update under /dl/ (not the homepage videos): platform, version and file type. es-mac and
 * es-windows are Spanish Keyboard, counted for english.ltd.
 */
export function parseDownload(pathname: string):
  { site: Site; platform: string; version: string; file: string; path: string } | null {
  const m = /^\/dl\/((?:es-)?(?:mac|windows))\/(\d+(?:\.\d+){1,3})\/[\w.-]+\.(pkg|dmg|zip|exe|msi)$/.exec(pathname);
  if (!m) return null;
  const es = m[1].startsWith("es-");
  return { site: es ? EN_SITE : SITE, platform: es ? m[1].slice(3) : m[1], version: m[2], file: m[3], path: pathname.slice(4) };
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

/**
 * english.ltd's server and this one both have the shared Upstash token (the try-it limits), so a key derived
 * from it authenticates english.ltd's forwarded hits and its dashboard's reads without a new shared secret.
 */
export const serviceToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const serviceKey = (token: string) => sha256(`english-ltd-stats:${token}`);

/** The day's visitor id: not reversible without the secret, and different every day. */
export const visitorId = async (secret: string, day: string, ip: string, ua: string) =>
  (await sha256(`yec-visitor:${secret}:${day}:${ip}:${ua}`)).slice(0, 24);
