import { describe, expect, it } from "vitest";
import { MAX_SAMPLES, parseDeviceId, parseSamples, textProblem } from "../src/lib/samples";

const NOW = Date.parse("2026-10-26T08:00:00Z");
const DEV = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const CARD = "9b2c1d3e-4f56-4a7b-8c9d-0e1f2a3b4c5d";
const zhEn = { kind: "zh_en", card_id: CARD, ts: NOW, vote: "down", reason: "wrong_tone", outcome: "replaced",
  tone: "work", app_category: "chat", len_bucket: "m", source_zh: "我明天下午把方案发给你", output_en: "I'll send you the proposal tomorrow afternoon." };
const polish = { kind: "polish", card_id: CARD, vote: "up", outcome: "accepted", change_size: "small",
  source_en: "I has send the file yesterday.", output_polished: "I sent the file yesterday." };
const env = (samples: unknown[], extra: Record<string, unknown> = {}) => ({
  device_id: DEV, app_version: "0.2.2 (35)", os_version: "15.4", platform: "mac", channel: "beta", improve_on: true, samples, ...extra,
});

describe("parseSamples", () => {
  it("accepts both kinds and keeps only the fields for each", () => {
    const r = parseSamples(env([zhEn, { ...polish, tone: "work", reason: "too_much" }]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    const [a, b] = r.batch.samples;
    expect(a).toMatchObject({ kind: "zh_en", source: zhEn.source_zh, output: zhEn.output_en, reason: "wrong_tone", tone: "work" });
    // reason only on 👎, tone only on zh_en
    expect(b).toMatchObject({ kind: "polish", source: polish.source_en, reason: null, tone: null, changeSize: "small", outcome: "accepted" });
    expect(r.batch.rejected).toEqual({ invalid: 0, filtered: 0 });
  });

  it("discards non-beta builds and requests with the switch off", () => {
    expect(parseSamples(env([zhEn], { channel: "stable" }), NOW)).toEqual({ ok: true, discarded: "channel", count: 1 });
    expect(parseSamples(env([zhEn], { improve_on: false }), NOW)).toEqual({ ok: true, discarded: "improve_off", count: 1 });
    expect(parseSamples(env([zhEn], { improve_on: undefined }), NOW)).toMatchObject({ discarded: "improve_off" });
  });

  it("enforces the length limits in characters", () => {
    const ok = parseSamples(env([{ ...zhEn, source_zh: "好".repeat(500) }]), NOW);
    const long = parseSamples(env([{ ...zhEn, source_zh: "好".repeat(501) }]), NOW);
    const longEn = parseSamples(env([{ ...polish, source_en: "a".repeat(1001) }]), NOW);
    expect(ok.ok && "batch" in ok && ok.batch.samples.length).toBe(1);
    expect(long.ok && "batch" in long && long.batch.rejected.invalid).toBe(1);
    expect(longEn.ok && "batch" in longEn && longEn.batch.rejected.invalid).toBe(1);
  });

  it("drops a sample whose source or output has digits, an email or a URL", () => {
    const bad = [
      { ...zhEn, source_zh: "验证码是 123456" }, { ...zhEn, output_en: "Call me at 13800138000" },
      { ...zhEn, source_zh: "发到 a.b@example.com" }, { ...polish, source_en: "see https://x.y/z" },
      { ...polish, output_polished: "Visit www.example.org" }, { ...polish, source_en: "it is on youdao.com now" },
      { ...zhEn, source_zh: "卡号１２３４５６７８" },
    ];
    const r = parseSamples(env([...bad, zhEn]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    expect(r.batch.rejected.filtered).toBe(bad.length);
    expect(r.batch.samples).toHaveLength(1);
  });

  it("drops malformed samples but keeps the rest", () => {
    const r = parseSamples(env([{ ...zhEn, kind: "survey" }, { ...zhEn, vote: "meh" }, { ...zhEn, card_id: "x" },
      { ...zhEn, output_en: "" }, { ...polish, source_zh: "错的字段" }, { ...zhEn, source_zh: "a\u0007b" }, polish]), NOW);
    if (!r.ok || !("batch" in r)) throw new Error("expected batch");
    expect(r.batch.rejected.invalid).toBe(5);
    // A field from the other kind is ignored, never stored.
    expect(r.batch.samples).toHaveLength(2);
    expect(JSON.stringify(r.batch.samples)).not.toContain("错的字段");
  });

  it("rejects a malformed envelope", () => {
    expect(parseSamples(env([]), NOW)).toMatchObject({ ok: false, error: "samples" });
    expect(parseSamples(env(Array(MAX_SAMPLES + 1).fill(zhEn)), NOW)).toMatchObject({ ok: false, error: "samples" });
    expect(parseSamples(env([zhEn], { device_id: "nope" }), NOW)).toMatchObject({ ok: false, error: "device_id" });
    expect(parseSamples([], NOW)).toMatchObject({ ok: false });
  });

  it("allows ordinary text", () => {
    expect(textProblem("2026 年 10 月的会议改到周三")).toBeNull();
    expect(textProblem("Let's meet at 3:30 p.m., e.g. in room 12.")).toBeNull();
  });
});

describe("parseDeviceId", () => {
  it("reads a UUID device id", () => {
    expect(parseDeviceId({ device_id: DEV.toUpperCase() })).toBe(DEV);
    expect(parseDeviceId({ device_id: "1" })).toBeNull();
  });
});
