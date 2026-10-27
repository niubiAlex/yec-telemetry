import { storedProduct } from "./product";

// 「帮助改进翻译和润色」 samples (docs/beta-metrics-plan.md, section 7).
//
// The only place the collector takes text. A sample is sent when the user
// votes 👍 / 👎 on a card or polish suggestion, or writes a reason on the
// day-7 survey, from a beta build with the switch on. The client filters first; this repeats the filters, and a sample
// that fails any of them is dropped, never trimmed.

export const SAMPLE_KINDS = ["zh_en", "polish", "survey"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

export const MAX_SAMPLE_BODY_BYTES = 64 * 1024;
export const MAX_SAMPLES = 20;
export const RETENTION_DAYS = 90;
/** Max length of each text field, in characters (code points). */
export const LIMITS = { source_zh: 500, output_en: 2000, source_en: 1000, output_polished: 2000, comment: 500 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9 ._()+-]{1,32}$/;
const DAY_MS = 86_400_000;

const oneOf = (...values: string[]) => (v: unknown): v is string => typeof v === "string" && values.includes(v);
const isApp = oneOf("chat", "mail", "doc", "code", "other");
const isLen = oneOf("s", "m", "l", "xl");
const isVote = oneOf("up", "down");
const isTone = oneOf("chat", "work", "academic");
const isChange = oneOf("small", "medium", "large");
const isSurvey = oneOf("day7_disappointment");
const isAnswer = oneOf("very", "somewhat", "not");
type CardKind = Exclude<SampleKind, "survey">;
const REASONS: Record<CardKind, (v: unknown) => v is string> = {
  zh_en: oneOf("wrong_meaning", "unnatural", "wrong_tone", "too_long", "other"),
  polish: oneOf("wrong_meaning", "unnatural", "not_needed", "too_much", "other"),
};
const OUTCOMES: Record<CardKind, (v: unknown) => v is string> = {
  zh_en: oneOf("replaced", "undone", "edited", "dismissed", "turned_off", "glanced", "none"),
  polish: oneOf("accepted", "undone", "edited", "dismissed", "turned_off", "glanced", "none"),
};

// Six or more digits in a row (phone numbers, codes, card numbers), ASCII or full-width.
const DIGITS = /[0-9０-９]{6,}/;
const EMAIL = /[^\s@＠]+[@＠][^\s@＠]+\.[^\s@＠]+/;
const URL_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|cn|net|org|io|me|co|top|xyz|edu|gov|info|app|dev|ai|cc|tv)\b/i;
// Control characters other than tab and newline.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

export type Reject = "invalid" | "filtered";

/** Why a text must not be stored, or null if it may be. */
export function textProblem(s: string): Reject | null {
  if (CONTROL.test(s)) return "invalid";
  if (DIGITS.test(s) || EMAIL.test(s) || URL_RE.test(s)) return "filtered";
  return null;
}

const length = (s: string) => [...s].length;

export interface CleanSample {
  kind: SampleKind;
  /** What the sample is about: the card_id, or the survey name for `survey`. */
  ref: string;
  cardId: string | null;
  ts: number;
  /** source_zh, source_en, or the survey comment. */
  source: string;
  output: string | null;
  vote: string | null;
  answer: string | null;
  reason: string | null;
  outcome: string | null;
  tone: string | null;
  changeSize: string | null;
  appCategory: string | null;
  lenBucket: string | null;
}

export interface SampleBatch {
  deviceId: string;
  appVersion: string;
  osVersion: string;
  platform: string | null;
  /** lib/product.ts: "zh" when missing. */
  product: string;
  samples: CleanSample[];
  rejected: { invalid: number; filtered: number };
}

export type ParsedSamples =
  | { ok: true; batch: SampleBatch }
  | { ok: true; discarded: "channel" | "improve_off"; count: number }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string | Reject {
  if (typeof v !== "string") return "invalid";
  const s = v.trim();
  if (s.length === 0 || length(s) > max) return "invalid";
  return textProblem(s) ?? s;
}

function sampleTs(v: unknown, now: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= now - 30 * DAY_MS && v <= now + DAY_MS ? Math.trunc(v) : now;
}

function parseSample(e: unknown, now: number): CleanSample | Reject {
  if (!isObject(e)) return "invalid";
  const kind = e.kind;
  const common = { tone: null, changeSize: null, appCategory: null, lenBucket: null, reason: null, outcome: null };
  if (kind === "survey") {
    if (!isSurvey(e.survey)) return "invalid";
    const comment = text(e.comment, LIMITS.comment);
    if (comment === "invalid" || comment === "filtered") return comment;
    return { ...common, kind, ref: e.survey, cardId: null, ts: sampleTs(e.ts, now), source: comment, output: null,
      vote: null, answer: isAnswer(e.answer) ? e.answer : null };
  }
  if (kind !== "zh_en" && kind !== "polish") return "invalid";
  if (typeof e.card_id !== "string" || !UUID.test(e.card_id)) return "invalid";
  if (!isVote(e.vote)) return "invalid";
  const [srcKey, outKey] = kind === "zh_en" ? (["source_zh", "output_en"] as const) : (["source_en", "output_polished"] as const);
  const source = text(e[srcKey], LIMITS[srcKey]);
  const output = text(e[outKey], LIMITS[outKey]);
  if (source === "invalid" || output === "invalid") return "invalid";
  if (source === "filtered" || output === "filtered") return "filtered";
  const cardId = e.card_id.toLowerCase();
  return {
    kind, ref: cardId, cardId, ts: sampleTs(e.ts, now), source, output, vote: e.vote, answer: null,
    reason: e.vote === "down" && REASONS[kind](e.reason) ? e.reason : null,
    outcome: OUTCOMES[kind](e.outcome) ? e.outcome : null,
    tone: kind === "zh_en" && isTone(e.tone) ? e.tone : null,
    changeSize: kind === "polish" && isChange(e.change_size) ? e.change_size : null,
    appCategory: isApp(e.app_category) ? e.app_category : null,
    lenBucket: isLen(e.len_bucket) ? e.len_bucket : null,
  };
}

/**
 * A malformed envelope fails the request (400, the client drops it). A
 * request from a non-beta build or with the switch off is acknowledged and
 * thrown away. A bad or filtered sample only drops that sample.
 */
export function parseSamples(body: unknown, now = Date.now()): ParsedSamples {
  if (!isObject(body)) return { ok: false, error: "body must be an object" };
  const { device_id, app_version, os_version, channel, improve_on, samples, platform, product } = body;
  if (typeof device_id !== "string" || !UUID.test(device_id)) return { ok: false, error: "device_id" };
  if (typeof app_version !== "string" || !VERSION.test(app_version)) return { ok: false, error: "app_version" };
  if (typeof os_version !== "string" || !VERSION.test(os_version)) return { ok: false, error: "os_version" };
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > MAX_SAMPLES) return { ok: false, error: "samples" };
  if (channel !== "beta") return { ok: true, discarded: "channel", count: samples.length };
  if (improve_on !== true) return { ok: true, discarded: "improve_off", count: samples.length };

  const clean: CleanSample[] = [];
  const rejected = { invalid: 0, filtered: 0 };
  for (const e of samples) {
    const s = parseSample(e, now);
    if (typeof s === "string") rejected[s]++;
    else clean.push(s);
  }
  return {
    ok: true,
    batch: {
      deviceId: device_id.toLowerCase(), appVersion: app_version, osVersion: os_version,
      platform: platform === "mac" || platform === "windows" ? platform : null,
      product: storedProduct(product),
      samples: clean, rejected,
    },
  };
}

export function parseDeviceId(body: unknown): string | null {
  return isObject(body) && typeof body.device_id === "string" && UUID.test(body.device_id)
    ? body.device_id.toLowerCase() : null;
}
