import { describe, expect, it } from "vitest";
import { EN_HITS, beijingDay, device, firstRequest, isBot, isBrowser, parseDownload, parseHit, visitorId } from "../src/lib/hits";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50";

describe("parseHit", () => {
  it("keeps known names and props only", () => {
    expect(parseHit({ name: "view", props: { ref: "www.Google.com", utm_source: "wechat", text: "我想说", path: "/x" } }))
      .toEqual({ name: "view", props: { ref: "google.com", utm_source: "wechat" } });
    expect(parseHit({ name: "download_click", props: { platform: "mac" } })).toEqual({ name: "download_click", props: { platform: "mac" } });
    expect(parseHit({ name: "join_view" })).toEqual({ name: "join_view", props: {} });
  });
  it("drops bad values instead of storing them", () => {
    expect(parseHit({ name: "download_click", props: { platform: "linux" } })).toEqual({ name: "download_click", props: {} });
    expect(parseHit({ name: "view", props: { ref: "https://a.com/path?q=1" } })).toEqual({ name: "view", props: {} });
    expect(parseHit({ name: "try", props: { source: "model", text: "你好" } })).toEqual({ name: "try", props: { source: "model" } });
    expect(parseHit({ name: "view", props: { utm_campaign: "x".repeat(61) } })).toEqual({ name: "view", props: {} });
  });
  it("rejects unknown names and server-only ones", () => {
    expect(parseHit({ name: "download", props: { path: "mac/0.2.6/a.pkg" } })).toBeNull();
    expect(parseHit({ name: "toString" })).toBeNull();
    expect(parseHit({ name: "view", props: [] })).toBeNull();
    expect(parseHit(null)).toBeNull();
  });
});

describe("english.ltd hits", () => {
  it("keeps page paths, modes and limit kinds, never text", () => {
    expect(parseHit({ name: "view", props: { path: "/es/acentos", lang: "es", q: "hola" } }, EN_HITS))
      .toEqual({ name: "view", props: { path: "/es/acentos", lang: "es" } });
    expect(parseHit({ name: "translate", props: { mode: "en_es", result: "mock", text: "hello" } }, EN_HITS))
      .toEqual({ name: "translate", props: { mode: "en_es", result: "mock" } });
    expect(parseHit({ name: "limit_hit", props: { by: "ip" } }, EN_HITS)).toEqual({ name: "limit_hit", props: { by: "ip" } });
    expect(parseHit({ name: "view", props: { path: "https://x.com/a?b=c" } }, EN_HITS)).toEqual({ name: "view", props: {} });
    expect(parseHit({ name: "video_play" }, EN_HITS)).toBeNull();
    expect(parseHit({ name: "limit_hit" })).toBeNull();
  });
});

describe("user agents", () => {
  it("drops obvious bots, keeps browsers and in-app browsers", () => {
    expect(isBot(CHROME)).toBe(false);
    expect(isBot(IPHONE)).toBe(false);
    for (const ua of ["Googlebot/2.1", "Mozilla/5.0 HeadlessChrome/130", "curl/8.4.0", "python-requests/2.31", "facebookexternalhit/1.1"]) {
      expect(isBot(ua)).toBe(true);
    }
  });
  it("tells devices and the apps' updaters apart", () => {
    expect(device(CHROME)).toBe("desktop");
    expect(device(IPHONE)).toBe("mobile");
    expect(isBrowser(CHROME)).toBe(true);
    expect(isBrowser("YoudaoCopilotIME/0.2.6 CFNetwork/1568 Darwin/25.0.0")).toBe(false);
  });
});

describe("downloads", () => {
  it("parses installers and updates, not the homepage videos", () => {
    expect(parseDownload("/dl/mac/0.2.6/YoudaoCopilotIME-0.2.6.pkg"))
      .toEqual({ site: "yec_web", platform: "mac", version: "0.2.6", file: "pkg", path: "mac/0.2.6/YoudaoCopilotIME-0.2.6.pkg" });
    expect(parseDownload("/dl/es-windows/0.1.0/SpanishKeyboardSetup-0.1.0.exe"))
      .toEqual({ site: "english_ltd", platform: "windows", version: "0.1.0", file: "exe", path: "es-windows/0.1.0/SpanishKeyboardSetup-0.1.0.exe" });
    expect(parseDownload("/dl/windows/0.2.5/YoudaoCopilotSetup-0.2.5.exe")?.platform).toBe("windows");
    expect(parseDownload("/dl/site/promo-work-16x9.mp4")).toBeNull();
    expect(parseDownload("/dl/mac/../x.pkg")).toBeNull();
  });
  it("counts first requests only", () => {
    expect(firstRequest("GET", null)).toBe(true);
    expect(firstRequest("GET", "bytes=0-")).toBe(true);
    expect(firstRequest("GET", "bytes=1048576-")).toBe(false);
    expect(firstRequest("HEAD", null)).toBe(false);
  });
});

describe("visitorId", () => {
  it("is stable within a day and changes the next day", async () => {
    const a = await visitorId("s", "2026-10-28", "1.2.3.4", CHROME);
    expect(await visitorId("s", "2026-10-28", "1.2.3.4", CHROME)).toBe(a);
    expect(await visitorId("s", "2026-10-29", "1.2.3.4", CHROME)).not.toBe(a);
    expect(await visitorId("t", "2026-10-28", "1.2.3.4", CHROME)).not.toBe(a);
    expect(a).not.toContain("1.2.3.4");
  });
  it("uses the Beijing day", () => {
    expect(beijingDay(Date.parse("2026-10-28T16:30:00Z"))).toBe("2026-10-29");
  });
});
