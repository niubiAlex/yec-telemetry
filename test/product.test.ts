import { describe, expect, it } from "vitest";
import { productParam, scoped, storedProduct } from "../src/lib/product";
import { parseBatch } from "../src/lib/schema";
import { parseWebBatch } from "../src/lib/web";

const ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const batch = (extra: Record<string, unknown> = {}) => ({
  batch_id: ID, device_id: ID, app_version: "0.3.0", os_version: "macOS 15", events: [{ name: "install", ts: Date.now() }], ...extra,
});

describe("product", () => {
  it("defaults a missing product to 中文版 and keeps any other value apart", () => {
    expect(storedProduct(undefined)).toBe("zh");
    expect(storedProduct(null)).toBe("zh");
    expect(storedProduct("es")).toBe("es");
    expect(storedProduct("es_en_web")).toBe("es_en_web");
    expect(storedProduct("ES!")).toBe("unknown");
    expect(storedProduct(3)).toBe("unknown");
  });

  it("stores the batch product", () => {
    const a = parseBatch(batch());
    const b = parseBatch(batch({ product: "es" }));
    expect(a.ok && a.batch.meta.product).toBe("zh");
    expect(b.ok && b.batch.meta.product).toBe("es");
  });

  it("dashboard param only knows the two products", () => {
    expect(productParam("es")).toBe("es");
    expect(productParam("toString")).toBe("zh");
    expect(productParam(undefined)).toBe("zh");
  });

  it("scopes plain and WITH queries", () => {
    expect(scoped("SELECT 1 FROM events", "es")).toMatch(/^WITH events AS NOT MATERIALIZED \(SELECT \* FROM events WHERE product = 'es'\),[\s\S]*samples AS[\s\S]*\nSELECT 1 FROM events$/);
    const w = scoped("\n  WITH a AS (SELECT 1) SELECT * FROM a", "zh");
    expect(w).toMatch(/product = 'zh'\),\na AS \(SELECT 1\) SELECT \* FROM a$/);
    expect((w.match(/\bWITH\b/g) ?? []).length).toBe(1);
  });
});

describe("web events", () => {
  it("keeps only the web events and their enum props", () => {
    const r = parseWebBatch({ visitor_id: ID, events: [
      { name: "web_demo_sentence", ts: Date.now(), props: { lang: "es", mode: "es_en", result: "model", text: "hola" } },
      { name: "card_shown", props: {} },
      { name: "web_download_click", props: { platform: "linux", lang: "en" } },
    ] }, ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.meta.product).toBe("es_en_web");
    expect(r.batch.dropped).toBe(1);
    expect(r.batch.events.map((e) => e.props)).toEqual([{ lang: "es", mode: "es_en", result: "model" }, { lang: "en" }]);
  });

  it("rejects a missing visitor id", () => {
    expect(parseWebBatch({ events: [{ name: "web_page_view" }] }, ID).ok).toBe(false);
  });
});
