import { describe, expect, it } from "vitest";
import { checkConfig, checkDoc, checkManifest, compareVersions, dmgDocName, docName, forClient, pickRelease, type Manifest } from "../src/lib/remote";

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

  it("keeps the DMG manifest apart from the zip ones", () => {
    const dmg = { ...manifest, format: "dmg" };
    expect(dmgDocName("mac")).toBe("update-mac-dmg");
    expect(dmgDocName("mac", "test")).toBe("update-mac-dmg-test");
    expect(dmgDocName("windows")).toBeNull();
    expect(dmgDocName("es-mac")).toBeNull();
    expect(checkDoc("update-mac-dmg", dmg).ok).toBe(true);
    expect(checkDoc("update-mac-dmg-test", manifest).ok).toBe(false);
    expect(checkDoc("update-mac-dmg", { ...manifest, format: "zip" }).ok).toBe(false);
    expect(checkDoc("update-mac", dmg).ok).toBe(false);
    expect(checkDoc("update-windows", dmg).ok).toBe(false);
    const tgz = { ...manifest, format: "tgz" };
    expect(checkDoc("update-mac-dmg", tgz).ok).toBe(true);
    expect(checkDoc("update-mac-dmg-test", { ...manifest, format: "pkg" }).ok).toBe(false);
    expect(checkDoc("update-mac", tgz).ok).toBe(false);
    expect(checkDoc("update-es-mac", tgz).ok).toBe(false);
  });

  it("serves a package only to clients that listed its format", () => {
    const zip = { ...manifest, version: "0.2.8.1" } as Manifest;
    const dmg = { ...manifest, version: "0.2.10", format: "dmg" } as Manifest;
    const tgz = { ...manifest, version: "0.2.10", format: "tgz" } as Manifest;
    expect(pickRelease(zip, tgz, null)).toBe(zip);
    expect(pickRelease(zip, tgz, "dmg")).toBe(zip);
    expect(pickRelease(zip, tgz, "dmg,tgz")).toBe(tgz);
    expect(pickRelease(zip, tgz, "tgz")).toBe(tgz);
    expect(pickRelease(zip, dmg, "dmg")).toBe(dmg);
    expect(pickRelease(zip, dmg, "dmg,tgz")).toBe(dmg);
    expect(pickRelease(zip, dmg, "tgz")).toBe(zip);
    expect(pickRelease(zip, dmg, "dmgx")).toBe(zip);
    expect(pickRelease({ ...zip, version: "0.2.11" }, tgz, "dmg,tgz")?.version).toBe("0.2.11");
    expect(pickRelease(null, tgz, "dmg,tgz")).toBe(tgz);
    expect(pickRelease(null, tgz, "dmg")).toBeNull();
    expect(pickRelease(zip, null, "dmg,tgz")).toBe(zip);
  });

  it("compares versions as the clients do", () => {
    expect(compareVersions("0.2.9", "0.2.8.1")).toBe(1);
    expect(compareVersions("0.2.8.1", "0.2.8")).toBe(1);
    expect(compareVersions("0.2.8", "0.2.8.0")).toBe(0);
    expect(compareVersions("0.2.10", "0.2.9")).toBe(1);
  });
});
