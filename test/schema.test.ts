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
      { name: "app_used", ts: NOW, props: { bundle_id: "C:\\Windows\\notepad.exe" } },
      { name: "app_used", ts: NOW, props: { bundle_id: "https://x.y" } },
      { name: "app_used", ts: NOW, props: { bundle_id: " . " } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.events.map((e) => e.props)).toEqual([{ tone: "chat" }, {}, { ms: 900, ok: false }, {}, {}, {}, {}]);
  });

  it("accepts Windows exe names as bundle_id, on app_used and the per-app events", () => {
    const exes = ["WeChat.exe", "foo_bar (x64).exe", "微信.exe", "Notepad++.exe"];
    const r = parseBatch(envelope([
      ...exes.map((b) => ({ name: "app_used", ts: NOW, props: { bundle_id: b, app_name: "X" } })),
      { name: "card_shown", ts: NOW, props: { tone: "chat", bundle_id: "WeChat.exe" } },
      { name: "typing_stats", ts: NOW, props: { chars: 10, bundle_id: "com.tencent.xinWeChat" } },
    ]), NOW);
    if (!r.ok) throw new Error(r.error);
    expect(r.batch.events.slice(0, 4).map((e) => e.props.bundle_id)).toEqual(exes);
    expect(r.batch.events[4].props).toEqual({ tone: "chat", bundle_id: "WeChat.exe" });
    expect(r.batch.events[5].props).toEqual({ chars: 10, bundle_id: "com.tencent.xinWeChat" });
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

  it("keeps 导入词库 counts and drops anything that could hold a word", () => {
    const r = parseBatch(envelope([
      { name: "dict_import", ts: NOW,
        props: { dict_source: "apple", format: "apple_lexicon", found: 2827, added: 652, entry: "onboarding" } },
      { name: "dict_import_removed", ts: NOW, props: { dict_source: "all", removed: 652 } },
      { name: "dict_import", ts: NOW,
        props: { dict_source: "王鹏飞", format: "docx", found: -1, added: 1.5, entry: "chat", word: "鹏飞" } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.events.map((e) => e.props)).toEqual([
      { dict_source: "apple", format: "apple_lexicon", found: 2827, added: 652, entry: "onboarding" },
      { dict_source: "all", removed: 652 },
      {},
    ]);
  });

  it("keeps the beta plan's batch-level fields and drops invalid ones without failing the batch", () => {
    const ok = parseBatch({ ...envelope([{ name: "install", ts: NOW }]), platform: "windows", channel: "beta",
      english_level: "B1", onboarded: true, install_date: "2026-10-12", improve_on: false }, NOW);
    expect(ok.ok && ok.batch.meta).toEqual({ platform: "windows", channel: "beta", englishLevel: "B1", onboarded: true,
      installDate: "2026-10-12", improveOn: false, product: "zh" });
    const bad = parseBatch({ ...envelope([{ name: "install", ts: NOW }]), platform: "linux", channel: "Beta 1",
      english_level: "D9", onboarded: "yes", install_date: "2026-02-30", improve_on: 1 }, NOW);
    expect(bad.ok && bad.batch.meta).toEqual({ platform: null, channel: null, englishLevel: null, onboarded: null,
      installDate: null, improveOn: null, product: "zh" });
    const old = parseBatch(envelope([{ name: "install", ts: NOW }]), NOW);
    expect(old.ok && old.batch.meta.platform).toBe(null);
  });

  it("accepts the beta plan's new events and fields", () => {
    const card = "11111111-2222-4333-8444-555555555555";
    const r = parseBatch(envelope([
      { name: "input_time_daily", ts: NOW, props: { day: "2026-10-15", commits: 120, chars: 900, chars_en_typed: 40,
        chars_en_card: 30, away_30m: 1, youdao_typing_min: 55, away_min: 20, zh_only_typing_min: 40, switch_away: 3,
        switch_back: 2, typing_min_chat: 30, typing_min_code: 25, text: "我们" } },
      { name: "card_shown", ts: NOW, props: { tone: "work", card_id: card, app_category: "mail", len_bucket: "m", trigger: "auto" } },
      { name: "card_closed", ts: NOW, props: { card_id: card, tone: "work", reason: "x_button", app_category: "mail" } },
      { name: "ime_deactivated", ts: NOW, props: { to_kind: "latin_layout", recent_card_id: card, struggle: true, recent_backspaces: 12 } },
      { name: "typing_stats", ts: NOW, props: { app_category: "chat", commits: 50, first_hit: 41, keys: 300, chars: 120 } },
      { name: "translation_toggled", ts: NOW, props: { feature: "translate", scope: "app", on: false, app_category: "code" } },
      { name: "word_reviewed", ts: NOW, props: { entry: "recall", result: "known" } },
      { name: "ime_restarted", ts: NOW, props: { kind: "crash", uptime_min: 300 } },
      { name: "level_setting", ts: NOW, props: { kind: "english", level: "B2" } },
      { name: "dict_opened", ts: NOW, props: { entry: "gloss" } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.dropped).toBe(0);
    const [daily, shown, closed, away, typing, toggled, reviewed, restarted, level, dict] = r.batch.events.map((e) => e.props);
    expect(daily).not.toHaveProperty("text");
    expect(daily).toMatchObject({ day: "2026-10-15", commits: 120, away_30m: 1, typing_min_code: 25 });
    expect(shown).toEqual({ tone: "work", card_id: card, app_category: "mail", len_bucket: "m", trigger: "auto" });
    expect(closed).toEqual({ card_id: card, tone: "work", reason: "x_button", app_category: "mail" });
    expect(away).toEqual({ to_kind: "latin_layout", recent_card_id: card, struggle: true, recent_backspaces: 12 });
    expect(typing).toEqual({ app_category: "chat", commits: 50, first_hit: 41, keys: 300, chars: 120 });
    expect(toggled).toEqual({ feature: "translate", scope: "app", on: false, app_category: "code" });
    expect(reviewed).toEqual({ entry: "recall", result: "known" });
    expect(restarted).toEqual({ kind: "crash", uptime_min: 300 });
    expect(level).toEqual({ kind: "english", level: "B2" });
    expect(dict).toEqual({ entry: "gloss" });
  });

  it("accepts turning cards off and on, and still accepts the deprecated close events", () => {
    const card = "11111111-2222-4333-8444-555555555555";
    const r = parseBatch(envelope([
      { name: "translation_turned_off", ts: NOW, props: { feature: "translate", source: "x_button", scope: "global",
        card_id: card, tone: "chat", app_category: "chat" } },
      { name: "translation_turned_off", ts: NOW, props: { feature: "polish", source: "shortcut", scope: "global", recent_card_id: card } },
      { name: "translation_turned_on", ts: NOW, props: { feature: "translate", source: "settings", scope: "app",
        app_category: "code", off_min: 95 } },
      { name: "translation_turned_on", ts: NOW, props: { source: "first_run", off_min: -1 } },
      { name: "input_time_daily", ts: NOW, props: { day: "2026-10-15", commits: 3, translate_on: false, polish_on: true } },
      { name: "card_closed", ts: NOW, props: { card_id: card, reason: "x_button" } },
      { name: "polish_closed", ts: NOW, props: { card_id: card, reason: "x_button" } },
      { name: "translation_toggled", ts: NOW, props: { feature: "translate", scope: "global", on: false } },
    ]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.dropped).toBe(0);
    expect(r.batch.events.map((e) => e.props)).toEqual([
      { feature: "translate", source: "x_button", scope: "global", card_id: card, tone: "chat", app_category: "chat" },
      { feature: "polish", source: "shortcut", scope: "global", recent_card_id: card },
      { feature: "translate", source: "settings", scope: "app", app_category: "code", off_min: 95 },
      {},
      { day: "2026-10-15", commits: 3, translate_on: false, polish_on: true },
      { card_id: card, reason: "x_button" },
      { card_id: card, reason: "x_button" },
      { feature: "translate", scope: "global", on: false },
    ]);
  });

  it("checks event-specific values for shared prop names", () => {
    const r = parseBatch(envelope([
      { name: "ime_restarted", ts: NOW, props: { kind: "english" } },
      { name: "level_setting", ts: NOW, props: { kind: "crash", level: "B1" } },
      { name: "card_closed", ts: NOW, props: { reason: "too_long", card_id: "not-a-uuid" } },
      { name: "input_time_daily", ts: NOW, props: { day: "2026-13-01", commits: -1, youdao_typing_min: 2000 } },
      { name: "dict_import", ts: NOW, props: { entry: "card" } },
    ]), NOW);
    expect(r.ok && r.batch.events.map((e) => e.props)).toEqual([{}, { level: "B1" }, {}, {}, {}]);
  });

  it("keeps the Spanish keyboard's lang_pair and mode_switched, dropping bad values", () => {
    const r = parseBatch(envelope([
      { name: "card_shown", ts: NOW, props: { tone: "work", lang_pair: "es_en" } },
      { name: "polish_accepted", ts: NOW, props: { method: "tab", ok: true, lang_pair: "en_en" } },
      { name: "card_replaced", ts: NOW, props: { method: "tab", lang_pair: "zh_en" } },
      { name: "mode_switched", ts: NOW, props: { from_mode: "en_es", to_mode: "es_en", via: "shortcut" } },
      { name: "mode_switched", ts: NOW, props: { from_mode: "fr", to_mode: "en_en", via: "voice" } },
    ]), NOW);
    expect(r.ok && r.batch.events.map((e) => e.props)).toEqual([
      { tone: "work", lang_pair: "es_en" },
      { method: "tab", ok: true, lang_pair: "en_en" },
      { method: "tab" },
      { from_mode: "en_es", to_mode: "es_en", via: "shortcut" },
      { to_mode: "en_en" },
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
