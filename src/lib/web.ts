import type { Batch, CleanEvent } from "./schema";

// Counts-only events from the public Spanish keyboard website (product
// "es_en_web"), sent by its server. No text, no URL, no IP: a per-session
// random id, the page language and a few enums.

export const WEB_PRODUCT = "es_en_web";
export const MAX_WEB_BODY_BYTES = 8 * 1024;
const MAX_WEB_EVENTS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

const oneOf = (...values: string[]) => (v: unknown) => typeof v === "string" && values.includes(v);
const MODE = oneOf("es_en", "en_es", "en_en");
const PROP: Record<string, (v: unknown) => boolean> = {
  lang: oneOf("es", "en"),
  mode: MODE,
  tone: oneOf("casual", "work", "formal"),
  // model: a real translation; mock: the built-in examples; limited: over the daily limit.
  result: oneOf("model", "mock", "limited", "error"),
  platform: oneOf("mac", "windows"),
};

export const WEB_EVENTS: Record<string, readonly string[]> = {
  web_page_view: ["lang"],
  web_demo_sentence: ["lang", "mode", "result"],
  web_card_accepted: ["lang", "mode", "tone"],
  web_download_click: ["lang", "platform"],
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A web batch as a regular Batch (stored like the IME's), or an error. Unknown events are dropped. */
export function parseWebBatch(body: unknown, batchId: string, now = Date.now()):
  { ok: true; batch: Batch } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: "body must be an object" };
  const { visitor_id, events } = body;
  if (typeof visitor_id !== "string" || !UUID.test(visitor_id)) return { ok: false, error: "visitor_id" };
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_WEB_EVENTS) return { ok: false, error: "events" };
  const clean: CleanEvent[] = [];
  let dropped = 0;
  for (const e of events) {
    if (!isObject(e) || typeof e.name !== "string") return { ok: false, error: "event shape" };
    const allowed = WEB_EVENTS[e.name];
    if (!allowed) { dropped++; continue; }
    const ts = typeof e.ts === "number" && e.ts >= now - DAY_MS && e.ts <= now + DAY_MS ? Math.trunc(e.ts) : now;
    const props: Record<string, unknown> = {};
    if (isObject(e.props)) for (const k of allowed) if (PROP[k](e.props[k])) props[k] = e.props[k];
    clean.push({ name: e.name, ts, props });
  }
  if (clean.length === 0) return { ok: false, error: "events" };
  return {
    ok: true,
    batch: {
      batchId, deviceId: visitor_id.toLowerCase(), appVersion: "web", osVersion: "web",
      meta: { platform: null, channel: null, englishLevel: null, onboarded: null, installDate: null, improveOn: null,
        typingLogOn: null, product: WEB_PRODUCT },
      events: clean, dropped,
    },
  };
}