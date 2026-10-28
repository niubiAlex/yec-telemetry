import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Daily limits on the homepage try-it box's model translations, the same
// scheme as english.ltd's demo (spanish-keyboard-site src/lib/limit.ts).
// Days are UTC.
// - Per visitor cookie (signed, random id): PER_VISITOR.
// - Per IP (salted hash, the IP itself is never stored): PER_IP. Every model
//   request counts here, with or without a cookie, so clearing the cookie
//   does not reset the budget.
// - Requests without a valid cookie share one more per-IP counter, also capped
//   at PER_VISITOR, so skipping the cookie gives no extra budget.
// - Whole site: GLOBAL.
// A request is allowed only when every counter it touches is under its limit;
// the check and the increments run as one atomic step, and refused requests
// do not count.
//
// The counters live in the Upstash store english.ltd uses (KV_REST_API_* or
// UPSTASH_REDIS_REST_*), under their own "yec:try:" prefix. Without those
// variables each instance counts on its own (in memory), which is for local
// development only.

export const PER_VISITOR = Number(process.env.TRY_PER_VISITOR_DAILY) || 20;
export const PER_IP = Number(process.env.TRY_PER_IP_DAILY) || 100;
export const GLOBAL = Number(process.env.TRY_GLOBAL_DAILY) || 2000;

export const VISITOR_COOKIE = "yec_vid";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const PREFIX = "yec:try";

const storeUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const storeToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// LIMIT_SECRET when set; otherwise derived from the store token so no extra
// env var is needed. Rotating it invalidates existing cookies.
const secret = () =>
  createHash("sha256")
    .update(`yec-limit|${process.env.LIMIT_SECRET || storeToken() || process.env.ADMIN_TOKEN || "yec-dev"}`)
    .digest();

const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url").slice(0, 32);

export function newVisitorCookie(): string {
  const id = randomBytes(16).toString("base64url");
  return `${id}.${sign(id)}`;
}

/** The visitor id when the cookie is present and correctly signed, else null. */
export function verifyVisitorCookie(value: string | undefined): string | null {
  if (!value) return null;
  const [id, mac] = value.split(".");
  if (!id || !mac || !/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const want = Buffer.from(sign(id));
  const got = Buffer.from(mac);
  return got.length === want.length && timingSafeEqual(got, want) ? id : null;
}

const day = () => new Date().toISOString().slice(0, 10);
const ipKey = (ip: string) =>
  createHash("sha256").update(`${process.env.LIMIT_SALT ?? "yec-try"}|${day()}|${ip}`).digest("hex").slice(0, 24);

const SCRIPT = `
for i = 1, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') >= tonumber(ARGV[i]) then return i end
end
for i = 1, #KEYS do
  redis.call('INCR', KEYS[i])
  redis.call('EXPIRE', KEYS[i], 172800)
end
return 0`;

const memory = new Map<string, number>();
let memoryDay = "";

/** 0 when allowed and counted, else the 1-based index of the first limit hit. */
async function take(keys: string[], limits: number[]): Promise<number> {
  const url = storeUrl();
  const token = storeToken();
  if (url && token) {
    const r = await fetch(url.replace(/\/$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["EVAL", SCRIPT, String(keys.length), ...keys, ...limits.map(String)]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`limit store ${r.status}`);
    return Number(((await r.json()) as { result: number }).result);
  }
  if (memoryDay !== day()) { memory.clear(); memoryDay = day(); }
  const hit = keys.findIndex((k, i) => (memory.get(k) ?? 0) >= limits[i]);
  if (hit >= 0) return hit + 1;
  for (const k of keys) memory.set(k, (memory.get(k) ?? 0) + 1);
  return 0;
}

export type Verdict = "ok" | "visitor" | "ip" | "site";

/** Counts one model translation unless a limit is already reached. */
export async function allow(ip: string, visitor: string | null): Promise<Verdict> {
  const d = day();
  const checks: [string, number, Verdict][] = [
    [`${PREFIX}:all:${d}`, GLOBAL, "site"],
    [`${PREFIX}:ip:${d}:${ipKey(ip)}`, PER_IP, "ip"],
  ];
  if (visitor) checks.push([`${PREFIX}:c:${d}:${visitor}`, PER_VISITOR, "visitor"]);
  else checks.push([`${PREFIX}:nc:${d}:${ipKey(ip)}`, PER_VISITOR, "visitor"]);
  const hit = await take(checks.map((c) => c[0]), checks.map((c) => c[1]));
  return hit === 0 ? "ok" : checks[hit - 1][2];
}
