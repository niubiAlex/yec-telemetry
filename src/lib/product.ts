// Which package a batch or sample came from: 中文版 (有道输入) or the
// Spanish⇄English package. Every client before the Spanish package sends no
// `product`, so a missing one is 中文版. Any other value is kept as sent (or
// "unknown"), so a typo in a new client can never count as either product.

export const PRODUCTS = { zh: "中文版", es: "西语版" } as const;
export type Product = keyof typeof PRODUCTS;

export const isProduct = (v: unknown): v is Product => v === "zh" || v === "es";

/** A dashboard ?product= value; anything else is 中文版. */
export const productParam = (v: unknown): Product => (isProduct(v) ? v : "zh");

/** The batch-level `product` as stored. */
export function storedProduct(v: unknown): string {
  if (v === undefined || v === null) return "zh";
  return typeof v === "string" && /^[a-z][a-z0-9_]{0,23}$/.test(v) ? v : "unknown";
}

/**
 * Runs `sql` against one product's rows: `events`, `batches` and `samples`
 * are shadowed by CTEs of the same name, so every query that reads them
 * unqualified sees only that product. (Without RECURSIVE a CTE cannot see
 * itself, so `FROM events` inside each one is the real table.)
 */
export function scoped(sql: string, product: Product): string {
  const p = productParam(product);
  const ctes = ["events", "batches", "samples"]
    .map((t) => `${t} AS NOT MATERIALIZED (SELECT * FROM ${t} WHERE product = '${p}')`).join(",\n  ");
  const m = /^\s*WITH\s+/i.exec(sql);
  if (m && /^\s*WITH\s+RECURSIVE\b/i.test(sql)) throw new Error("scoped(): WITH RECURSIVE is not supported");
  return m ? `WITH ${ctes},\n${sql.slice(m[0].length)}` : `WITH ${ctes}\n${sql}`;
}
