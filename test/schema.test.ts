import { describe, expect, it } from "vitest";
import { parseBatch } from "../src/lib/schema";

const NOW = Date.UTC(2026, 9, 16, 8);
const envelope = (events: unknown[]) => ({
  batch_id: "6F1C2B0E-8C4D-4E8A-9B1A-2D3E4F5A6B7C",
  device_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  app_version: "1.4 (27)",
  os_version: "15.4.1",
  events,
});

describe("parseBatch", () => {
  it("keeps allowlisted props and lowercases ids", () => {
    const r = parseBatch(envelope([
      { name: "card_replaced", ts: NOW, props: { method: "tab", tone: "work", ok: false, fail_reason: "cursor_moved" } },
      { name: "app_used", ts: NOW, props: { bundle_id: "com.tencent.xinWeChat", app_name: " 微信 " } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.batchId).toBe("6f1c2b0e-8c4d-4e8a-9b1a-2d3e4f5a6b7c");
    expect(r.batch.events[0].props).toEqual({ method: "tab", tone: "work", ok: false, fail_reason: "cursor_moved" });
    expect(r.batch.events[1].props).toEqual({ bundle_id: "com.tencent.xinWeChat", app_name: "微信" });
  });

  it("drops props that could carry text", () => {
    const r = parseBatch(envelope([
      { name: "card_shown", ts: NOW, props: { tone: "chat", text: "我们下周再说", url: "https://x" } },
      { name: "card_dismissed", ts: NOW, props: { tone: "Let's move it to next week" } },
      { name: "sentence_latency", ts: NOW, props: { ms: 900, ok: false, error_code: "HTTP 403: key sk-abc" } },
      { name: "app_used", ts: NOW, props: { bundle_id: "com.x/../y", app_name: "a\nb" } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.events.map((e) => e.props)).toEqual([{ tone: "chat" }, {}, { ms: 900, ok: false }, {}]);
  });

  it("keeps the onboarding events' source and page", () => {
    const r = parseBatch(envelope([
      { name: "onboarding_shown", ts: NOW, props: { source: "first_run" } },
      { name: "onboarding_shown", ts: NOW, props: { source: "indicator" } },
      { name: "onboarding_skipped", ts: NOW, props: { page: 2 } },
      { name: "onboarding_completed", ts: NOW, props: { page: 6 } },
      { name: "onboarding_shown", ts: NOW, props: { source: "a link in a chat" } },
      { name: "onboarding_skipped", ts: NOW, props: { page: 0, source: "menu" } },
      { name: "onboarding_skipped", ts: NOW, props: { page: 2.5 } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.events.map((e) => e.props)).toEqual([
      { source: "first_run" }, { source: "indicator" }, { page: 2 }, { page: 6 }, {}, {}, {},
    ]);
  });

  it("skips unknown events but keeps the batch", () => {
    const r = parseBatch(envelope([{ name: "typed_text", ts: NOW, props: {} }, { name: "install", ts: NOW }]), NOW);
    expect(r.ok && r.batch.events.map((e) => e.name)).toEqual(["install"]);
    expect(r.ok && r.batch.dropped).toBe(1);
  });

  it("pins an implausible timestamp to arrival", () => {
    const r = parseBatch(envelope([{ name: "install", ts: 0 }, { name: "install", ts: NOW - 1000 }]), NOW);
    expect(r.ok && r.batch.events.map((e) => e.ts)).toEqual([NOW, NOW - 1000]);
  });

  it("rejects a bad envelope", () => {
    expect(parseBatch(null).ok).toBe(false);
    expect(parseBatch({ ...envelope([{ name: "install", ts: NOW }]), device_id: "me@example.com" }).ok).toBe(false);
    expect(parseBatch(envelope([])).ok).toBe(false);
    expect(parseBatch(envelope(Array(201).fill({ name: "install", ts: NOW }))).ok).toBe(false);
    expect(parseBatch(envelope([{ name: "install", ts: "yesterday" }])).ok).toBe(false);
  });
});
