import { storedProduct } from "./product";
import { textProblem, type Reject } from "./samples";

// 打字明细 (docs/beta-metrics-plan.md, section 7): what a beta user typed and
// every card made for it, uploaded only after they tapped 同意 on the consent
// notice. Kept apart from events and samples, read only on /users/<device>.
//
// The client filters first; this repeats the filters, and a record that
// fails any of them is dropped, never trimmed.

export const MAX_TYPING_BODY_BYTES = 64 * 1024;
export const MAX_RECORDS = 50;
export const TYPING_RETENTION_DAYS = 90;
export const LIMITS = { text: 1000, source: 1000, output: 2000 } as const;

/** Where the committed text came from: a candidate, typed straight in, a 联想 pick or flush, a card accept. */
export const VIAS = ["zh", "en", "other", "card"] as const;
export const CARD_KINDS = ["translate", "polish"] as const;
/** CardTracker's outcomes, plus `unshown`: the reply came back but the card never went up. */
export const OUTCOMES = ["replaced", "accepted", "undone", "edited", "dismissed", "closed", "turned_off", "glanced", "none",
  "unshown"] as const;

/** 已采纳 / 看了没用 / 没看, from a card's outcome. */
export type Seen = "adopted" | "seen" | "unseen";
export function seenOf(outcome: string): Seen {
  if (outcome === "replaced" || outcome === "accepted" || outcome === "edited") return "adopted";
  if (outcome === "none" || outcome === "unshown") return "unseen";
  return "seen";
}
/** The same rule in SQL, over a column named `outcome`. */
export const SEEN_SQL = `CASE WHEN outcome IN ('replaced', 'accepted', 'edited') THEN 'adopted'
  WHEN outcome IN ('none', 'unshown') THEN 'unseen' ELSE 'seen' END`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9 ._()+-]{1,32}$/;
const DAY_MS = 86_400_000;

const oneOf = <T extends string>(values: readonly T[]) => (v: unknown): v is T =>
  typeof v === "string" && (values as readonly string[]).includes(v);
const isApp = oneOf(["chat", "mail", "doc", "code", "other"]);
const isTone = oneOf(["chat", "work", "academic"]);
const isPair = oneOf(["zh_en", "en_en", "es_en", "en_es"]);
const isVia = oneOf(VIAS);
const isKind = oneOf(CARD_KINDS);
const isOutcome = oneOf(OUTCOMES);

export interface CommitRecord {
  type: "commit";
  rid: string;
  ts: number;
  appCategory: string | null;
  text: string;
  via: string;
}

export interface CardRecord {
  type: "card";
  rid: string;
  ts: number;
  appCategory: string | null;
  cardId: string;
  kind: string;
  langPair: string | null;
  source: string;
  output: string;
  tone: string | null;
  outcome: string;
}

export type TypingRecord = CommitRecord | CardRecord;

export interface TypingBatch {
  deviceId: string;
  appVersion: string;
  osVersion: string;
  platform: string | null;
  product: string;
  noticeVersion: number;
  records: TypingRecord[];
  rejected: { invalid: number; filtered: number };
}

export type ParsedTyping =
  | { ok: true; batch: TypingBatch }
  | { ok: true; discarded: "channel" | "consent"; count: number }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string | Reject {
  if (typeof v !== "string") return "invalid";
  const s = v.trim();
  if (s.length === 0 || [...s].length > max) return "invalid";
  return textProblem(s) ?? s;
}

function recordTs(v: unknown, now: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= now - 30 * DAY_MS && v <= now + DAY_MS ? Math.trunc(v) : now;
}

function parseRecord(e: unknown, now: number): TypingRecord | Reject {
  if (!isObject(e)) return "invalid";
  const ts = recordTs(e.ts, now);
  const appCategory = isApp(e.app_category) ? e.app_category : null;
  if (e.type === "commit") {
    if (typeof e.rid !== "string" || !UUID.test(e.rid) || !isVia(e.via)) return "invalid";
    const t = text(e.text, LIMITS.text);
    if (t === "invalid" || t === "filtered") return t;
    return { type: "commit", rid: e.rid.toLowerCase(), ts, appCategory, text: t, via: e.via };
  }
  if (e.type === "card") {
    if (typeof e.card_id !== "string" || !UUID.test(e.card_id) || !isKind(e.kind) || !isOutcome(e.outcome)) return "invalid";
    const source = text(e.source, LIMITS.source);
    const output = text(e.output, LIMITS.output);
    if (source === "invalid" || output === "invalid") return "invalid";
    if (source === "filtered" || output === "filtered") return "filtered";
    const cardId = e.card_id.toLowerCase();
    return {
      type: "card", rid: cardId, ts, appCategory, cardId, kind: e.kind, source, output, outcome: e.outcome,
      langPair: isPair(e.lang_pair) ? e.lang_pair : null,
      tone: e.kind === "translate" && isTone(e.tone) ? e.tone : null,
    };
  }
  return "invalid";
}

/**
 * A malformed envelope fails the request (400, the client drops it). A
 * request from a non-beta build or without consent is acknowledged and
 * thrown away. A bad or filtered record only drops that record.
 */
export function parseTyping(body: unknown, now = Date.now()): ParsedTyping {
  if (!isObject(body)) return { ok: false, error: "body must be an object" };
  const { device_id, app_version, os_version, channel, consent, notice_version, records, platform, product } = body;
  if (typeof device_id !== "string" || !UUID.test(device_id)) return { ok: false, error: "device_id" };
  if (typeof app_version !== "string" || !VERSION.test(app_version)) return { ok: false, error: "app_version" };
  if (typeof os_version !== "string" || !VERSION.test(os_version)) return { ok: false, error: "os_version" };
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_RECORDS) return { ok: false, error: "records" };
  if (channel !== "beta") return { ok: true, discarded: "channel", count: records.length };
  if (consent !== true || typeof notice_version !== "number" || !Number.isInteger(notice_version) || notice_version < 1) {
    return { ok: true, discarded: "consent", count: records.length };
  }

  // One row per rid: the database cannot upsert the same row twice in one statement.
  const byRid = new Map<string, TypingRecord>();
  const rejected = { invalid: 0, filtered: 0 };
  for (const e of records) {
    const r = parseRecord(e, now);
    if (typeof r === "string") rejected[r]++;
    else byRid.set(r.rid, r);
  }
  const clean = [...byRid.values()];
  return {
    ok: true,
    batch: {
      deviceId: device_id.toLowerCase(), appVersion: app_version, osVersion: os_version,
      platform: platform === "mac" || platform === "windows" ? platform : null,
      product: storedProduct(product), noticeVersion: Math.min(notice_version, 100),
      records: clean, rejected,
    },
  };
}
