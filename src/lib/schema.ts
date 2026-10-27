import { storedProduct } from "./product";

// The wire format, mirrored from the IME's Telemetry.swift (TelemetryEvent).
//
// The client already strips anything off-schema; this repeats the checks so a
// tampered or buggy client cannot put text into the database either. Every
// prop is an enum, flag, bounded number or short code. Nothing here can hold
// typed text, a translation, a URL or a key.

export const TONES = ["chat", "work", "academic"] as const;
// Older values are kept so batches from earlier builds (Tab, Ctrl+Return, right Option) still count.
const METHODS = ["click", "ctrl_j", "ctrl_return", "right_option", "tab"];
// Where 新手引导 was opened: on its own the first time, the input method menu
// (Mac) or the 中/英 indicator's menu (Windows), the tray menu, Settings, or
// the command line.
const ONBOARDING_SOURCES = ["first_run", "menu", "indicator", "tray", "settings", "command_line"];
// 导入词库: which input method the words came from, the file format, and
// where the import started. Never the words.
const DICT_SOURCES = ["apple", "sogou", "wetype", "mspy", "other"];
const DICT_FORMATS = ["apple_lexicon", "scel", "sogou_bin", "mspy_udp", "mspy_udl", "txt"];

export const APP_CATEGORIES = ["chat", "mail", "doc", "code", "other"] as const;

const isTone = (v: unknown) => typeof v === "string" && (TONES as readonly string[]).includes(v);
const code = (re: RegExp) => (v: unknown) => typeof v === "string" && re.test(v);
const int = (lo: number, hi: number) => (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf = (...values: string[]) => (v: unknown) => typeof v === "string" && values.includes(v);
const bool = (v: unknown) => typeof v === "boolean";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = code(UUID);

/** A real calendar day, YYYY-MM-DD (so the database can cast it). */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^20\d\d-\d\d-\d\d$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

type Check = (v: unknown) => boolean;

const COUNT = int(0, 10_000_000);
const MINUTES = int(0, 1440);
const KIND = oneOf("cjk_ime", "latin_layout", "other");
export const LANG_PAIRS = ["en_es", "es_en", "en_en"] as const;
const LANG_PAIR = oneOf(...LANG_PAIRS);

const PROP: Record<string, Check> = {
  tone: isTone,
  from: isTone,
  to: isTone,
  method: (v) => typeof v === "string" && METHODS.includes(v),
  ok: (v) => typeof v === "boolean",
  fail_reason: code(/^[a-z0-9_.-]{1,40}$/),
  error_code: code(/^[a-z0-9_.-]{1,40}$/),
  ms: int(0, 120_000),
  // A Mac bundle id ("com.tencent.xinWeChat") or a Windows exe file name
  // ("WeChat.exe", "Foo_Bar (x64).exe", "微信.exe"). No slash, backslash or
  // colon, so it can never hold a path or a URL.
  bundle_id: code(/^(?=.*[\p{L}\p{N}])[\p{L}\p{N}._+() -]{1,128}$/u),
  // An app's display name ("微信"). Short, no control characters.
  app_name: (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 64 && !/[\u0000-\u001f\u007f]/.test(v),
  kind: (v) => v === "english" || v === "new_word",
  level: code(/^[A-Za-z0-9_]{1,12}$/),
  index: int(0, 50),
  key: code(/^[a-z0-9_.]{1,40}$/),
  source: (v) => typeof v === "string" && ONBOARDING_SOURCES.includes(v),
  page: int(1, 20),
  // `all` only on dict_import_removed, for 全部移除.
  dict_source: (v) => typeof v === "string" && (DICT_SOURCES.includes(v) || v === "all"),
  format: (v) => typeof v === "string" && DICT_FORMATS.includes(v),
  found: int(0, 1_000_000),
  added: int(0, 1_000_000),
  removed: int(0, 1_000_000),
  entry: (v) => v === "settings" || v === "onboarding",

  // Beta metrics plan (docs/beta-metrics-plan.md). Counts only, never words.
  card_id: isUuid,
  recent_card_id: isUuid,
  app_category: oneOf(...APP_CATEGORIES),
  len_bucket: oneOf("s", "m", "l", "xl"),
  trigger: oneOf("auto", "ctrl_j", "click"),
  day: isDay,
  commits: COUNT,
  chars: COUNT,
  chars_en_typed: COUNT,
  chars_en_card: COUNT,
  away_30m: int(0, 10_000),
  youdao_typing_min: MINUTES,
  away_min: MINUTES,
  zh_only_typing_min: MINUTES,
  switch_away: int(0, 10_000),
  switch_back: int(0, 10_000),
  typing_min_chat: MINUTES,
  typing_min_mail: MINUTES,
  typing_min_doc: MINUTES,
  typing_min_code: MINUTES,
  typing_min_other: MINUTES,
  to_kind: KIND,
  from_kind: KIND,
  recent_backspaces: int(0, 10_000),
  recent_abandoned: int(0, 10_000),
  struggle: bool,
  away_s: int(0, 366 * 86_400),
  first_hit: COUNT,
  keys: COUNT,
  abandoned: COUNT,
  paged: COUNT,
  expanded: COUNT,
  backspaces: COUNT,
  en_commits: COUNT,
  en_chars: COUNT,
  edit_pct: int(0, 100),
  vote: oneOf("up", "down"),
  change_size: oneOf("small", "medium", "large"),
  feature: oneOf("translate", "polish"),
  scope: oneOf("global", "app"),
  on: bool,
  survey: oneOf("day7_disappointment"),
  attempt: int(1, 2),
  answer: oneOf("very", "somewhat", "not"),
  has_comment: bool,
  notice_version: int(1, 100),
  count: COUNT,
  p50_us: int(0, 600_000_000),
  p90_us: int(0, 600_000_000),
  p99_us: int(0, 600_000_000),
  max_us: int(0, 600_000_000),
  uptime_min: int(0, 525_600),
  result: oneOf("known", "unknown", "skipped"),
  days_since_highlight: int(0, 365),
  how: oneOf("english_mode", "edited_card"),
  translate_on: bool,
  polish_on: bool,
  off_min: int(0, 1_000_000),
  // Spanish Keyboard: direction of a card or polish suggestion, and mode switches.
  lang_pair: LANG_PAIR,
  from_mode: LANG_PAIR,
  to_mode: LANG_PAIR,
  via: oneOf("menu", "shortcut", "settings"),
};

// Props whose values depend on the event (`kind`, `entry`, `reason`, ...).
const EVENT_PROP: Record<string, Record<string, Check>> = {
  dict_opened: { entry: oneOf("card", "gloss", "menu", "dashboard") },
  word_added_to_book: { entry: oneOf("card", "dict", "dashboard") },
  learning_dashboard_opened: { entry: oneOf("menu", "card", "settings") },
  word_marked_known: { entry: oneOf("dict", "dashboard", "review") },
  word_reviewed: { entry: oneOf("recall", "dashboard") },
  user_word_added: { entry: oneOf("candidate", "settings") },
  improve_notice_shown: { entry: oneOf("onboarding", "first_run", "polish_launch") },
  improve_optin_changed: { entry: oneOf("notice", "settings") },
  ime_restarted: { kind: oneOf("crash", "hang_killed", "system") },
  word_first_highlighted: { kind: oneOf("gloss", "new_word") },
  word_typed_back: { kind: oneOf("gloss", "new_word") },
  translation_turned_off: { source: oneOf("x_button", "shortcut", "settings") },
  translation_turned_on: { source: oneOf("x_button", "shortcut", "settings") },
  card_closed: { reason: oneOf("x_button") },
  polish_closed: { reason: oneOf("x_button") },
  card_feedback: { reason: oneOf("wrong_meaning", "unnatural", "wrong_tone", "too_long", "other") },
  polish_feedback: { reason: oneOf("wrong_meaning", "unnatural", "not_needed", "too_much", "other") },
  polish_shown: { trigger: oneOf("auto", "shortcut", "click") },
};

const INPUT_TIME_DAILY = [
  "day", "commits", "chars", "chars_en_typed", "chars_en_card", "away_30m", "youdao_typing_min", "away_min",
  "zh_only_typing_min", "switch_away", "switch_back", "translate_on", "polish_on",
  "typing_min_chat", "typing_min_mail", "typing_min_doc", "typing_min_code", "typing_min_other",
] as const;

/** Event name -> the props kept for it. */
export const ALLOWLIST: Record<string, readonly string[]> = {
  install: [],
  first_launch: [],
  input_source_added: [],
  daily_active: [],
  app_used: ["bundle_id", "app_name", "app_category"],
  card_shown: ["tone", "card_id", "app_category", "len_bucket", "trigger", "bundle_id", "lang_pair"],
  card_replaced: ["method", "tone", "ok", "fail_reason", "card_id", "app_category", "len_bucket", "bundle_id", "lang_pair"],
  // Esc only; the X button sends translation_turned_off.
  card_dismissed: ["tone", "card_id", "lang_pair"],
  // Reserved: a card skipped by typing on, once the client splits it from Esc.
  card_ignored: ["tone"],
  card_undo_after_replace: ["method", "tone", "card_id", "lang_pair"],
  tone_switched: ["from", "to", "card_id", "lang_pair"],
  sentence_latency: ["ms", "ok", "error_code", "card_id", "lang_pair"],
  gloss_shown: [],
  dict_opened: ["entry"],
  new_word_shown: [],
  new_word_clicked: [],
  recall_shown: [],
  recall_clicked: [],
  level_setting: ["kind", "level"],
  candidate_panel_opened: [],
  radical_tab_clicked: [],
  candidate_index_chosen: ["index"],
  setting_changed: ["key"],
  onboarding_shown: ["source"],
  // `page`: the last page reached, 1-6.
  onboarding_completed: ["page"],
  onboarding_skipped: ["page"],
  dict_import: ["dict_source", "format", "found", "added", "entry"],
  dict_import_removed: ["dict_source", "removed"],

  // 1 真需求: daily totals (the server keeps the max per day) and input-method switches.
  input_time_daily: INPUT_TIME_DAILY,
  ime_deactivated: ["to_kind", "app_category", "recent_card_id", "recent_backspaces", "recent_abandoned", "struggle"],
  ime_activated: ["away_s", "from_kind"],
  ime_restarted: ["kind", "uptime_min"],
  survey_shown: ["survey", "attempt"],
  survey_answered: ["survey", "answer", "has_comment"],
  survey_dismissed: ["survey", "attempt"],
  // 2 只打中文: hourly totals per app category, or per app when bundle_id is set.
  typing_stats: ["app_category", "bundle_id", "commits", "first_hit", "keys", "chars", "abandoned", "paged", "expanded",
    "backspaces", "en_commits", "en_chars"],
  user_word_added: ["entry"],
  // 3 翻译准不准
  card_glanced: ["card_id", "tone", "app_category", "len_bucket", "bundle_id", "lang_pair"],
  card_edited_after_replace: ["card_id", "tone", "edit_pct", "lang_pair"],
  card_feedback: ["card_id", "tone", "vote", "reason", "lang_pair"],
  polish_shown: ["card_id", "app_category", "len_bucket", "change_size", "trigger", "bundle_id", "lang_pair"],
  polish_accepted: ["card_id", "method", "ok", "fail_reason", "lang_pair"],
  // Deprecated: superseded by translation_turned_off (feature=polish).
  polish_closed: ["card_id", "reason"],
  polish_dismissed: ["card_id", "lang_pair"],
  polish_undo_after_accept: ["card_id", "method", "lang_pair"],
  polish_glanced: ["card_id", "lang_pair"],
  polish_feedback: ["card_id", "vote", "reason", "lang_pair"],
  polish_latency: ["card_id", "ms", "ok", "error_code", "lang_pair"],
  // 4 打扰
  // X, the on/off shortcut or Settings: cards stay off until turned back on.
  translation_turned_off: ["feature", "source", "scope", "card_id", "recent_card_id", "tone", "app_category", "bundle_id"],
  translation_turned_on: ["feature", "source", "scope", "app_category", "off_min"],
  // Deprecated: superseded by translation_turned_off / translation_turned_on.
  card_closed: ["card_id", "tone", "reason", "app_category"],
  translation_toggled: ["feature", "scope", "on", "app_category", "recent_card_id"],
  key_latency: ["count", "p50_us", "p90_us", "p99_us", "max_us"],
  // 5 学习
  gloss_clicked: [],
  word_added_to_book: ["entry"],
  learning_dashboard_opened: ["entry"],
  word_marked_known: ["entry"],
  word_reviewed: ["entry", "result"],
  word_first_highlighted: ["kind"],
  word_typed_back: ["days_since_highlight", "kind", "how"],
  // 帮助改进
  improve_notice_shown: ["entry", "notice_version"],
  improve_optin_changed: ["on", "entry"],
  improve_samples_deleted: [],
  // Spanish Keyboard (product "es"): the direction picked in the menu, by shortcut or in Settings.
  mode_switched: ["from_mode", "to_mode", "via"],
};

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_EVENTS = 200;

const VERSION = /^[A-Za-z0-9 ._()+-]{1,32}$/;
const DAY_MS = 86_400_000;

export interface CleanEvent {
  name: string;
  ts: number; // ms since epoch
  props: Record<string, unknown>;
}

/** Batch-level fields from the beta plan. Null when missing or invalid (older clients send none). */
export interface BatchMeta {
  platform: string | null;
  channel: string | null;
  englishLevel: string | null;
  onboarded: boolean | null;
  installDate: string | null;
  improveOn: boolean | null;
  /** lib/product.ts: "zh" when missing (every client before the Spanish package). */
  product: string;
}

export interface Batch {
  batchId: string;
  deviceId: string;
  appVersion: string;
  osVersion: string;
  meta: BatchMeta;
  events: CleanEvent[];
  /** Events with an unknown name: skipped, the rest of the batch still counts. */
  dropped: number;
}

export type Parsed = { ok: true; batch: Batch } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const pick = <T>(v: unknown, ok: (v: unknown) => boolean) => (ok(v) ? (v as T) : null);

// An invalid batch-level field is dropped, never fails the batch.
function parseMeta(body: Record<string, unknown>): BatchMeta {
  return {
    platform: pick<string>(body.platform, oneOf("mac", "windows")),
    channel: pick<string>(body.channel, code(/^[a-z]{1,16}$/)),
    englishLevel: pick<string>(body.english_level, oneOf("A1", "A2", "B1", "B2", "C1", "C2", "unset")),
    onboarded: pick<boolean>(body.onboarded, bool),
    installDate: pick<string>(body.install_date, isDay),
    improveOn: pick<boolean>(body.improve_on, bool),
    product: storedProduct(body.product),
  };
}

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
      const own = EVENT_PROP[e.name] ?? {};
      for (const k of allowed) {
        if (k in e.props && (own[k] ?? PROP[k])(e.props[k])) {
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
      meta: parseMeta(body),
      events: clean,
      dropped,
    },
  };
}
