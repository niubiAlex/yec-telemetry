import { describe, expect, it } from "vitest";
import { checkConfig, checkDoc, checkManifest, docName, forClient } from "../src/lib/remote";

const config = {
  schema: 1,
  revision: 3,
  prompts: { tones: { chat: "short and spoken" }, sections: { translate: "Translate it." } },
  gateway: {
    revision: 1,
    appliesTo: ["https://dict-token-hub.youdao.com/v1"],
    baseURL: "https://dict-token-hub.youdao.com/v1",
    models: ["deepseek-v4-flash", "qwen3.7-flash"],
    model: "deepseek-v4-flash",
    fallbackModel: "qwen3.7-flash",
    key: "abcdefghijklmnop",
  },
  flags: { promptTuning: true },
  telemetry: { enabled: true },
  notice: { minVersion: "0.1.0", text: "请更新到最新版本" },
};

const manifest = {
  version: "0.2.0",
  urls: ["https://yec.askheadline.com/dl/windows/0.2.0/YoudaoCopilot-Setup.exe"],
  sha256: "a".repeat(64),
  size: 86789621,
  notes: "修复若干问题",
  published: "2026-10-22T10:00:00Z",
};

describe("checkConfig", () => {
  it("accepts a full config and a minimal one", () => {
    expect(checkConfig(config).ok).toBe(true);
    expect(checkConfig({ schema: 1, revision: 1 }).ok).toBe(true);
  });

  it("refuses anything off-shape", () => {
    const bad: unknown[] = [
      null,
      [],
      { ...config, schema: 2 },
      { ...config, revision: 0 },
      { ...config, extra: 1 },
      { ...config, prompts: { tones: { formal: "x" } } },
      { ...config, prompts: { tones: { chat: "" } } },
      { ...config, gateway: { ...config.gateway, baseURL: "http://plain.example.com/v1" } },
      { ...config, gateway: { ...config.gateway, appliesTo: [] } },
      { ...config, gateway: { ...config.gateway, model: "gpt-x" } },
      { ...config, gateway: { ...config.gateway, key: "has spaces in it" } },
      { ...config, gateway: { ...config.gateway, models: "deepseek-v4-flash" } },
      { ...config, flags: { promptTuning: "yes" } },
      { ...config, telemetry: { enabled: 1 } },
      { ...config, notice: { minVersion: "latest", text: "x" } },
    ];
    for (const b of bad) expect(checkConfig(b).ok, JSON.stringify(b)).toBe(false);
  });

  it("strips the key unless the request had the token", () => {
    const c = checkConfig(config);
    if (!c.ok) throw new Error(c.error);
    expect(forClient(c.value, false).gateway).not.toHaveProperty("key");
    expect(forClient(c.value, false).gateway?.baseURL).toBe(config.gateway.baseURL);
    expect(forClient(c.value, true).gateway?.key).toBe(config.gateway.key);
    expect(c.value.gateway?.key).toBe(config.gateway.key);
  });
});

describe("checkManifest", () => {
  it("accepts a release", () => expect(checkManifest(manifest).ok).toBe(true));

  it("refuses a bad one", () => {
    for (const b of [
      { ...manifest, version: "v2" },
      { ...manifest, urls: ["http://example.com/x.exe"] },
      { ...manifest, urls: [] },
      { ...manifest, sha256: "A".repeat(64) },
      { ...manifest, size: 0 },
      { ...manifest, published: "soon" },
      { ...manifest, url: "https://x" },
    ]) expect(checkManifest(b).ok, JSON.stringify(b)).toBe(false);
  });
});

describe("documents", () => {
  it("names by platform and channel", () => {
    expect(docName("mac")).toBe("update-mac");
    expect(docName("windows", "test")).toBe("update-windows-test");
    expect(docName("windows", "beta")).toBeNull();
    expect(docName("linux" as "mac")).toBeNull();
  });

  it("checks each by its kind", () => {
    expect(checkDoc("config", config).ok).toBe(true);
    expect(checkDoc("update-mac-test", manifest).ok).toBe(true);
    expect(checkDoc("update-mac", config).ok).toBe(false);
    expect(checkDoc("anything", manifest).ok).toBe(false);
    expect(docName("es-mac" as "mac")).toBe("update-es-mac");
    expect(docName("es-windows" as "mac", "test")).toBe("update-es-windows-test");
    expect(checkDoc("update-es-windows", manifest).ok).toBe(true);
    expect(checkDoc("update-es-linux", manifest).ok).toBe(false);
  });
});
