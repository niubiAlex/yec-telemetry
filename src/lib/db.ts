import { Pool } from "pg";
import type { Batch } from "./schema";

// One pool per server instance. On Vercel use Neon's pooled URL.
let pool: Pool | undefined;
export function db(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 3 });
  }
  return pool;
}

// Additive and idempotent: safe to run on every cold start, never drops data.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS batches (
  batch_id    uuid PRIMARY KEY,
  device_id   uuid NOT NULL,
  app_version text NOT NULL,
  os_version  text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id          bigserial PRIMARY KEY,
  batch_id    uuid NOT NULL REFERENCES batches(batch_id),
  device_id   uuid NOT NULL,
  name        text NOT NULL,
  ts          timestamptz NOT NULL,
  props       jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_ts_name ON events (ts, name);
CREATE INDEX IF NOT EXISTS events_device ON events (device_id);
CREATE INDEX IF NOT EXISTS batches_device ON batches (device_id, received_at);
CREATE TABLE IF NOT EXISTS remote_docs (
  name        text PRIMARY KEY,
  body        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
`;

let ready: Promise<void> | undefined;
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = db().query(SCHEMA).then(() => undefined);
    ready.catch(() => { ready = undefined; }); // retry on the next request
  }
  return ready;
}

/** A remote config or update manifest, as last published; null if never. */
export async function getDoc(name: string): Promise<{ body: unknown; updatedAt: Date } | null> {
  await ensureSchema();
  const r = await db().query("SELECT body, updated_at FROM remote_docs WHERE name = $1", [name]);
  return r.rowCount ? { body: r.rows[0].body, updatedAt: r.rows[0].updated_at } : null;
}

export async function putDoc(name: string, body: unknown): Promise<void> {
  await ensureSchema();
  await db().query(
    `INSERT INTO remote_docs (name, body) VALUES ($1, $2::jsonb)
     ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
    [name, JSON.stringify(body)],
  );
}

/**
 * Stores a batch once. A resend of the same batch_id (the client retries
 * after a timeout) is acknowledged without inserting again.
 */
export async function storeBatch(b: Batch): Promise<{ duplicate: boolean }> {
  await ensureSchema();
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO batches (batch_id, device_id, app_version, os_version)
       VALUES ($1, $2, $3, $4) ON CONFLICT (batch_id) DO NOTHING`,
      [b.batchId, b.deviceId, b.appVersion, b.osVersion],
    );
    if (inserted.rowCount === 0) {
      await client.query("ROLLBACK");
      return { duplicate: true };
    }
    if (b.events.length > 0) {
      await client.query(
        `INSERT INTO events (batch_id, device_id, name, ts, props)
         SELECT $1, $2, e.name, to_timestamp(e.ts / 1000.0), e.props::jsonb
         FROM unnest($3::text[], $4::float8[], $5::text[]) AS e(name, ts, props)`,
        [
          b.batchId,
          b.deviceId,
          b.events.map((e) => e.name),
          b.events.map((e) => e.ts),
          b.events.map((e) => JSON.stringify(e.props)),
        ],
      );
    }
    await client.query("COMMIT");
    return { duplicate: false };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
