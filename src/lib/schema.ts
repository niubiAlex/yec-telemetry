// The wire format, mirrored from the IME's Telemetry.swift (TelemetryEvent).
//
// The client already strips anything off-schema; this repeats the checks so a
// tampered or buggy client cannot put text into the database either. Every
// prop is an enum, flag, bounded number or short code. Nothing here can hold
// typed text, a translation, a URL or a key.

export const TONES = ["chat", "work", "academic"] as const;
const METHODS = ["click", "ctrl_return", "tab"];

const isTone = (v: unknown) => typeof v === "string" && (TONES as readonly string[]).includes(v);
const code = (re: RegExp) => (v: unknown) => typeof v === "string" && re.test(v);
const int = (lo: number, hi: number) => (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

type Check = (v: unknown) => boolean;

const PROP: Record<string, Check> = {
  tone: isTone,
  from: isTone,
  to: isTone,
  method: (v) => typeof v === "string" && METHODS.includes(v),
  ok: (v) => typeof v === "boolean",
  fail_reason: code(/^[a-z0-9_.-]{1,40}$/),
  error_code: code(/^[a-z0-9_.-]{1,40}$/),
  ms: int(0, 120_000),
  bundle_id: code(/^[A-Za-z0-9.-]{1,128}$/),
  // An app's display name ("微信"). Short, no control characters.
  app_name: (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 64 && !/[\u0000-\u001f\u007f]/.test(v),
  kind: (v) => v === "english" || v === "new_word",
  level: code(/^[A-Za-z0-9_]{1,12}$/),
  index: int(0, 50),
  key: code(/^[a-z0-9_.]{1,40}$/),
};

/** Event name -> the props kept for it. */
export const ALLOWLIST: Record<string, readonly string[]> = {
  install: [],
  first_launch: [],
  input_source_added: [],
  daily_active: [],
  app_used: ["bundle_id", "app_name"],
  card_shown: ["tone"],
  card_replaced: ["method", "tone", "ok", "fail_reason"],
  card_dismissed: ["tone"],
  // Reserved: a card skipped by typing on, once the client splits it from Esc.
  card_ignored: ["tone"],
  card_undo_after_replace: ["method", "tone"],
  tone_switched: ["from", "to"],
  sentence_latency: ["ms", "ok", "error_code"],
  gloss_shown: [],
  dict_opened: [],
  new_word_shown: [],
  new_word_clicked: [],
  recall_shown: [],
  recall_clicked: [],
  level_setting: ["kind", "level"],
  candidate_panel_opened: [],
  radical_tab_clicked: [],
  candidate_index_chosen: ["index"],
  setting_changed: ["key"],
};

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_EVENTS = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9 ._()+-]{1,32}$/;
const DAY_MS = 86_400_000;

export interface CleanEvent {
  name: string;
  ts: number; // ms since epoch
  props: Record<string, unknown>;
}

export interface Batch {
  batchId: string;
  deviceId: string;
  appVersion: string;
  osVersion: string;
  events: CleanEvent[];
  /** Events with an unknown name: skipped, the rest of the batch still counts. */
  dropped: number;
}

export type Parsed = { ok: true; batch: Batch } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates a batch. A malformed envelope fails the whole batch (the client
 * drops it on 400); an unknown event name only drops that event, so a newer
 * client never loses a batch to an older collector.
 */
export function parseBatch(body: unknown, now = Date.now()): Parsed {
  if (!isObject(body)) return { ok: false, error: "body must be an object" };
  const { batch_id, device_id, app_version, os_version, events } = body;
  if (typeof batch_id !== "string" || !UUID.test(batch_id)) return { ok: false, error: "batch_id" };
  if (typeof device_id !== "string" || !UUID.test(device_id)) return { ok: false, error: "device_id" };
  if (typeof app_version !== "string" || !VERSION.test(app_version)) return { ok: false, error: "app_version" };
  if (typeof os_version !== "string" || !VERSION.test(os_version)) return { ok: false, error: "os_version" };
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS) {
    return { ok: false, error: "events" };
  }

  const clean: CleanEvent[] = [];
  let dropped = 0;
  for (const e of events) {
    if (!isObject(e) || typeof e.name !== "string") return { ok: false, error: "event shape" };
    const allowed = ALLOWLIST[e.name];
    if (!allowed) { dropped++; continue; }
    if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) return { ok: false, error: "event ts" };
    // A wrong clock or a long-queued event still counts, on the day it arrived.
    const ts = e.ts >= now - 30 * DAY_MS && e.ts <= now + DAY_MS ? Math.trunc(e.ts) : now;
    const props: Record<string, unknown> = {};
    if (isObject(e.props)) {
      for (const k of allowed) {
        if (k in e.props && PROP[k](e.props[k])) {
          props[k] = k === "app_name" ? (e.props[k] as string).trim() : e.props[k];
        }
      }
    }
    clean.push({ name: e.name, ts, props });
  }

  return {
    ok: true,
    batch: {
      batchId: batch_id.toLowerCase(),
      deviceId: device_id.toLowerCase(),
      appVersion: app_version,
      osVersion: os_version,
      events: clean,
      dropped,
    },
  };
}
