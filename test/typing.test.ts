import { describe, expect, it } from "vitest";
import { MAX_RECORDS, parseTyping, seenOf } from "../src/lib/typing";
import { parseBatch } from "../src/lib/schema";

const NOW = Date.parse("2026-10-28T08:00:00Z");
const DEV = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const RID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const CARD = "9b2c1d3e-4f56-4a7b-8c9d-0e1f2a3b4c5d";
const commit = { type: "commit", rid: RID, ts: NOW, text: "我们下周再聊", via: "zh", app_category: "chat" };
const card = { type: "card", card_id: CARD, ts: NOW, kind: "translate", source: "我们下周再聊", output: "Let's talk next week.",
  tone: "chat", outcome: "glanced", app_category: "chat" };
const env = (records: unknown[], extra: Record<string, unknown> = {}) => ({
  batch_id: "11111111-2222-4333-8444-555555555555", device_id: DEV, app_version: "0.2.6 (40)", os_version: "15.4",
  platform: "mac", channel: "beta", consent: true, notice_version: 1, records, ...extra,
});

describe("parseTyping", () => {
  it("keeps commits and cards with only their own fields", () => {
    const r = parseTyping(env([commit, { ...card, kind: "polish", tone: "work", outcome: "accepted", via: "zh" }]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    const [a, b] = r.batch.records;
    expect(a).toEqual({ type: "commit", rid: RID, ts: NOW, appCategory: "chat", text: commit.text, via: "zh" });
    // tone only on translation cards; a card's rid is its card_id
    expect(b).toMatchObject({ type: "card", rid: CARD, cardId: CARD, kind: "polish", tone: null, outcome: "accepted" });
    expect(b).not.toHaveProperty("via");
    expect(r.batch.noticeVersion).toBe(1);
  });

  it("acknowledges and throws away non-beta builds and requests without consent", () => {
    expect(parseTyping(env([commit], { channel: "stable" }), NOW)).toEqual({ ok: true, discarded: "channel", count: 1 });
    expect(parseTyping(env([commit], { consent: false }), NOW)).toEqual({ ok: true, discarded: "consent", count: 1 });
    expect(parseTyping(env([commit], { consent: "true" }), NOW)).toEqual({ ok: true, discarded: "consent", count: 1 });
    expect(parseTyping(env([commit], { notice_version: undefined }), NOW)).toEqual({ ok: true, discarded: "consent", count: 1 });
  });

  it("drops a record whose text looks like a code, an email or a URL, and never trims it", () => {
    const r = parseTyping(env([
      { ...commit, text: "验证码 123456" },
      { ...commit, rid: CARD, text: "发到 a.b@example.com" },
      { ...card, output: "See https://example.com" },
      { ...commit, rid: "22222222-3333-4444-8555-666666666666", text: "好的" },
    ]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    expect(r.batch.records.map((x) => x.type === "commit" ? x.text : x.source)).toEqual(["好的"]);
    expect(r.batch.rejected).toEqual({ invalid: 0, filtered: 3 });
  });

  it("rejects unknown types, outcomes and malformed ids", () => {
    const r = parseTyping(env([
      { ...commit, type: "key" }, { ...commit, via: "paste" }, { ...commit, rid: "x" },
      { ...card, outcome: "maybe" }, { ...card, kind: "gloss" }, { ...card, card_id: "nope" }, { ...commit, text: "  " },
    ]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    expect(r.batch.records).toEqual([]);
    expect(r.batch.rejected.invalid).toBe(7);
  });

  it("keeps one row per rid: the last card outcome wins", () => {
    const r = parseTyping(env([card, { ...card, outcome: "replaced" }]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    expect(r.batch.records).toHaveLength(1);
    expect(r.batch.records[0]).toMatchObject({ outcome: "replaced" });
  });

  it("fails a malformed envelope", () => {
    expect(parseTyping(env([]), NOW)).toEqual({ ok: false, error: "records" });
    expect(parseTyping(env(Array(MAX_RECORDS + 1).fill(commit)), NOW)).toEqual({ ok: false, error: "records" });
    expect(parseTyping(env([commit], { device_id: "x" }), NOW)).toEqual({ ok: false, error: "device_id" });
  });
});

describe("seenOf", () => {
  it("buckets outcomes into 已采纳 / 看了没用 / 没看", () => {
    expect(["replaced", "accepted", "edited"].map(seenOf)).toEqual(["adopted", "adopted", "adopted"]);
    expect(["glanced", "dismissed", "closed", "undone", "turned_off"].map(seenOf)).toEqual(Array(5).fill("seen"));
    expect(["none", "unshown"].map(seenOf)).toEqual(["unseen", "unseen"]);
  });
});

describe("consent events", () => {
  it("are in the allowlist with notice_version", () => {
    const r = parseBatch({
      batch_id: "11111111-2222-4333-8444-555555555555", device_id: DEV, app_version: "0.2.6", os_version: "15.4",
      events: [
        { name: "typing_log_notice_shown", ts: NOW, props: { entry: "launch", notice_version: 1 } },
        { name: "typing_log_consent_changed", ts: NOW, props: { on: true, entry: "notice", notice_version: 1 } },
        { name: "typing_log_deleted", ts: NOW, props: { notice_version: 1, text: "never" } },
      ],
    }, NOW);
    expect(r.ok && r.batch.events.map((e) => e.props)).toEqual([
      { entry: "launch", notice_version: 1 }, { on: true, entry: "notice", notice_version: 1 }, { notice_version: 1 },
    ]);
  });
});
