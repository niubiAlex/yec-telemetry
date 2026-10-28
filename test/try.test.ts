import { describe, expect, it } from "vitest";
import { PER_IP, PER_VISITOR, allow, newVisitorCookie, verifyVisitorCookie } from "../src/lib/try/limit";
import { PRESETS, preset } from "../src/lib/try/presets";
import {
  fill, isChinese, lostEnglish, lostNumbers, maxTokens, parseTranslation, systemPrompt, translatePrompt, TONE_KEYS,
} from "../src/lib/try/prompt";

describe("translate prompt", () => {
  it("has the client's sections, tone lines and reply skeleton in order", () => {
    const p = translatePrompt("我们改到下周吧", "chat", {});
    expect(p.startsWith("For each tone, pick at most one word")).toBe(true);
    expect(p).toContain("the chat one in new_word / new_word_zh");
    expect(p).toContain("The user's English is CEFR B1");
    expect(p).toContain("never pick these): none.");
    expect(p).toContain("\n- chat: how a person actually texts on WeChat.");
    expect(p).toContain("\n- academic: formal written English");
    expect(p).toContain("Placeholders like [MENTION_A] are names");
    expect(p.endsWith(
      "\nReply JSON, keys in exactly this order:\n" +
      '{"kind":"translate","chat":"...","recall_word":"","recall_zh":"","new_word":"","new_word_zh":"",' +
      '"tones":{"work":"...","academic":"..."},"tone_new_words":{"work":{"word":"","zh":""},"academic":{"word":"","zh":""}},' +
      '"learnable":[{"phrase":"","zh":""}]}\n\nChinese: 我们改到下周吧',
    )).toBe(true);
    expect(p).not.toContain("previous draft dropped");
  });

  it("uses the remote config's tones and sections over the built-in ones", () => {
    const p = translatePrompt("你好", "work", { tones: { work: "TONE-W" }, sections: { rules: "RULES-X", system: "SYS" } });
    expect(p).toContain("\n- work: TONE-W\n");
    expect(p).toContain("\nRULES-X\n");
    expect(p).toContain('{"kind":"translate","work":"..."');
    expect(systemPrompt({ sections: { system: "SYS" } })).toBe("SYS");
  });

  it("asks again for lost numbers", () => {
    expect(translatePrompt("3点开会", "chat", {}, ["3"])).toContain("A previous draft dropped 3. Include it exactly.");
  });

  it("fills placeholders in one pass and leaves braces in values alone", () => {
    expect(fill("{a} and {b} {x}", { a: "{b}", b: "B" })).toBe("{b} and B {x}");
  });

  it("scales max_tokens like the client", () => {
    expect(maxTokens("短")).toBe(460);
    expect(maxTokens("字".repeat(40))).toBe(560);
  });
});

describe("reply parsing", () => {
  const reply = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";

  it("reads the lead tone at top level and the others under tones, and keeps new words that are really there", () => {
    const r = parseTranslation(reply({
      kind: "translate", chat: "Let's move it to next week.", new_word: "move it to", new_word_zh: "改到",
      tones: { work: "Let's reschedule to next week.", academic: "Let us reschedule this to next week." },
      tone_new_words: { work: { word: "reschedule", zh: "重新安排" }, academic: { word: "postpone", zh: "推迟" } },
    }), "我们改到下周吧", "chat");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.tones.work).toBe("Let's reschedule to next week.");
    expect(r.result.words.chat).toEqual({ word: "move it to", zh: "改到" });
    expect(r.result.words.work?.word).toBe("reschedule");
    expect(r.result.words.academic).toBeUndefined();
  });

  it("fills a missing or Chinese tone with the leading English", () => {
    const r = parseTranslation(JSON.stringify({ chat: "OK, tomorrow.", tones: { work: "明天发", academic: "" } }), "好的明天发", "chat");
    expect(r.ok && r.result.tones).toEqual({ chat: "OK, tomorrow.", work: "OK, tomorrow.", academic: "OK, tomorrow." });
  });

  it("sends a draft that drops a number or typed English back", () => {
    const r = parseTranslation(JSON.stringify({ chat: "Push it back two days.", tones: { work: "Extend by 2 days.", academic: "Extend it." } }),
      "这个 deadline 能不能往后推2天", "chat");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lost).toEqual(["2", "deadline"]);
  });

  it("accepts the ways English legitimately writes a Chinese number", () => {
    expect(lostNumbers("3月见", ["See you in March."])).toEqual([]);
    expect(lostNumbers("下午15点", ["at 3 p.m."])).toEqual([]);
    expect(lostNumbers("5万", ["50,000", "50k"])).toEqual([]);
    expect(lostNumbers("2个人", ["a couple of people"])).toEqual([]);
    expect(lostNumbers("15%", ["fifteen percent"])).toEqual(["15"]);
    expect(lostEnglish("KPI还没定", ["The KPIs are not set."])).toEqual([]);
  });

  it("rejects text with no usable JSON", () => {
    expect(parseTranslation("sorry", "你好", "chat")).toEqual({ ok: false, lost: [] });
  });

  it("detects Chinese input, mixed included", () => {
    expect(isChinese("这个 deadline 能不能 push 一下")).toBe(true);
    expect(isChinese("hello there")).toBe(false);
  });
});

describe("built-in examples", () => {
  it("match loosely and carry all three tones", () => {
    expect(preset("我们改到下周吧。")?.text).toBe("我们改到下周吧");
    expect(preset("这个deadline能不能往后推两天")?.text).toBe("这个 deadline 能不能往后推两天");
    expect(preset("我们改到下周")).toBeUndefined();
    for (const p of PRESETS) for (const t of TONE_KEYS) expect(p.result.tones[t]).toMatch(/^[A-Z]/);
  });
});

describe("visitor cookie", () => {
  it("accepts its own signature and rejects tampering", () => {
    const c = newVisitorCookie();
    const id = verifyVisitorCookie(c);
    expect(id).toBe(c.split(".")[0]);
    expect(verifyVisitorCookie(`${id}.${"A".repeat(32)}`)).toBeNull();
    expect(verifyVisitorCookie(`${newVisitorCookie().split(".")[0]}.${c.split(".")[1]}`)).toBeNull();
    expect(verifyVisitorCookie("junk")).toBeNull();
    expect(verifyVisitorCookie(undefined)).toBeNull();
  });
});

describe("daily limits (in-memory store)", () => {
  it("allows PER_VISITOR per cookie, and refused requests do not count", async () => {
    const id = verifyVisitorCookie(newVisitorCookie());
    for (let i = 0; i < PER_VISITOR; i++) expect(await allow("10.0.0.1", id)).toBe("ok");
    expect(await allow("10.0.0.1", id)).toBe("visitor");
    expect(await allow("10.0.0.1", id)).toBe("visitor");
    expect(await allow("10.0.0.1", verifyVisitorCookie(newVisitorCookie()))).toBe("ok");
  });

  it("caps cookieless requests at PER_VISITOR per IP", async () => {
    for (let i = 0; i < PER_VISITOR; i++) expect(await allow("10.0.0.4", null)).toBe("ok");
    expect(await allow("10.0.0.4", null)).toBe("visitor");
    expect(await allow("10.0.0.4", verifyVisitorCookie(newVisitorCookie()))).toBe("ok");
  });

  it("caps an IP at PER_IP across cookies and cookieless requests", async () => {
    for (let i = 0; i < PER_VISITOR; i++) expect(await allow("10.0.0.2", null)).toBe("ok");
    for (let used = PER_VISITOR; used < PER_IP; used++) {
      expect(await allow("10.0.0.2", verifyVisitorCookie(newVisitorCookie()))).toBe("ok");
    }
    expect(await allow("10.0.0.2", verifyVisitorCookie(newVisitorCookie()))).toBe("ip");
    expect(await allow("10.0.0.3", null)).toBe("ok");
  });
});
