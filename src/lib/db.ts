import { Pool } from "pg";
import type { Batch } from "./schema";
import { RETENTION_DAYS, type SampleBatch } from "./samples";
import { TYPING_RETENTION_DAYS, type TypingBatch } from "./typing";

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
// Sent as one multi-statement query, so it runs as one implicit transaction;
// the advisory lock (held to its end) serializes concurrent cold starts, which
// otherwise deadlock on the ALTER TABLE / UPDATE locks.
const SCHEMA = `
SELECT pg_advisory_xact_lock(727001);
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
ALTER TABLE batches ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS english_level text;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS onboarded boolean;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS install_date date;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS improve_on boolean;
CREATE INDEX IF NOT EXISTS events_name_ts ON events (name, ts);
CREATE TABLE IF NOT EXISTS samples (
  id           bigserial PRIMARY KEY,
  device_id    uuid NOT NULL,
  kind         text NOT NULL,
  card_id      uuid,
  ts           timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  app_version  text NOT NULL,
  os_version   text NOT NULL,
  platform     text,
  source       text NOT NULL,
  output       text,
  vote         text,
  reason       text,
  outcome      text,
  tone         text,
  change_size  text,
  app_category text,
  len_bucket   text
);
CREATE INDEX IF NOT EXISTS samples_received ON samples (received_at);
-- survey samples: no card, no output, no vote. ref = card_id, or the survey name.
ALTER TABLE samples ADD COLUMN IF NOT EXISTS ref text;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE samples ALTER COLUMN card_id DROP NOT NULL;
ALTER TABLE samples ALTER COLUMN output DROP NOT NULL;
ALTER TABLE samples ALTER COLUMN vote DROP NOT NULL;
UPDATE samples SET ref = card_id::text WHERE ref IS NULL AND card_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS samples_device_kind_ref ON samples (device_id, kind, ref);
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_device_id_kind_card_id_key;
-- 备注名 for invited beta users, set on the dashboard's 用户 page.
CREATE TABLE IF NOT EXISTS device_names (
  device_id   uuid PRIMARY KEY,
  name        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- 中文版 / 西语版 (lib/product.ts). Rows from before the field are 中文版.
ALTER TABLE batches ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'zh';
ALTER TABLE events ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'zh';
ALTER TABLE samples ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'zh';
CREATE TABLE IF NOT EXISTS remote_docs (
  name        text PRIMARY KEY,
  body        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- 打字明细 (lib/typing.ts): typed text and cards, only from devices that tapped 同意.
-- rid = the client's id for a commit record, the card_id for a card (a resend updates its outcome).
ALTER TABLE batches ADD COLUMN IF NOT EXISTS typing_log_on boolean;
CREATE TABLE IF NOT EXISTS typing_log (
  id             bigserial PRIMARY KEY,
  device_id      uuid NOT NULL,
  rid            uuid NOT NULL,
  type           text NOT NULL,
  ts             timestamptz NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  app_version    text NOT NULL,
  os_version     text NOT NULL,
  platform       text,
  product        text NOT NULL DEFAULT 'zh',
  notice_version int NOT NULL,
  app_category   text,
  text           text,
  via            text,
  card_id        uuid,
  kind           text,
  lang_pair      text,
  source         text,
  output         text,
  tone           text,
  outcome        text,
  UNIQUE (device_id, rid)
);
CREATE INDEX IF NOT EXISTS typing_log_device_ts ON typing_log (device_id, ts);
CREATE INDEX IF NOT EXISTS typing_log_received ON typing_log (received_at);
-- Homepage stats (lib/hits.ts). visitor = the day's salted hash of IP + UA; no IP, URL or typed text.
CREATE TABLE IF NOT EXISTS web_hits (
  id           bigserial PRIMARY KEY,
  site         text NOT NULL,
  ts           timestamptz NOT NULL DEFAULT now(),
  day          date NOT NULL,
  visitor      text NOT NULL,
  name         text NOT NULL,
  device       text NOT NULL,
  ref          text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  props        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS web_hits_site_day ON web_hits (site, day, name);
CREATE INDEX IF NOT EXISTS web_hits_visitor ON web_hits (day, visitor);
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
      `INSERT INTO batches (batch_id, device_id, app_version, os_version,
         platform, channel, english_level, onboarded, install_date, improve_on, product, typing_log_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (batch_id) DO NOTHING`,
      [b.batchId, b.deviceId, b.appVersion, b.osVersion, b.meta.platform, b.meta.channel,
        b.meta.englishLevel, b.meta.onboarded, b.meta.installDate, b.meta.improveOn, b.meta.product, b.meta.typingLogOn],
    );
    if (inserted.rowCount === 0) {
      await client.query("ROLLBACK");
      return { duplicate: true };
    }
    if (b.events.length > 0) {
      await client.query(
        `INSERT INTO events (batch_id, device_id, name, ts, props, product)
         SELECT $1, $2, e.name, to_timestamp(e.ts / 1000.0), e.props::jsonb, $6
         FROM unnest($3::text[], $4::float8[], $5::text[]) AS e(name, ts, props)`,
        [
          b.batchId,
          b.deviceId,
          b.events.map((e) => e.name),
          b.events.map((e) => e.ts),
          b.events.map((e) => JSON.stringify(e.props)),
          b.meta.product,
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

/**
 * Stores samples. A second vote on the same card (or a second reason on the
 * same survey) replaces the first, so a resent request duplicates nothing.
 */
export async function storeSamples(b: SampleBatch): Promise<number> {
  await ensureSchema();
  if (b.samples.length === 0) return 0;
  const col = <K extends keyof SampleBatch["samples"][number]>(k: K) => b.samples.map((s) => s[k]);
  const r = await db().query(
    `INSERT INTO samples (device_id, app_version, os_version, platform, kind, card_id, ts, source, output,
       vote, reason, outcome, tone, change_size, app_category, len_bucket, ref, answer, product)
     SELECT $1, $2, $3, $4, s.kind, s.card_id, to_timestamp(s.ts / 1000.0), s.source, s.output,
       s.vote, s.reason, s.outcome, s.tone, s.change_size, s.app_category, s.len_bucket, s.ref, s.answer, $19
     FROM unnest($5::text[], $6::uuid[], $7::float8[], $8::text[], $9::text[], $10::text[], $11::text[],
       $12::text[], $13::text[], $14::text[], $15::text[], $16::text[], $17::text[], $18::text[])
       AS s(kind, card_id, ts, source, output, vote, reason, outcome, tone, change_size, app_category, len_bucket, ref, answer)
     ON CONFLICT (device_id, kind, ref) DO UPDATE SET answer = EXCLUDED.answer,
       ts = EXCLUDED.ts, received_at = now(), app_version = EXCLUDED.app_version, os_version = EXCLUDED.os_version,
       platform = EXCLUDED.platform, source = EXCLUDED.source, output = EXCLUDED.output, vote = EXCLUDED.vote,
       reason = EXCLUDED.reason, outcome = EXCLUDED.outcome, tone = EXCLUDED.tone, change_size = EXCLUDED.change_size,
       app_category = EXCLUDED.app_category, len_bucket = EXCLUDED.len_bucket, product = EXCLUDED.product`,
    [b.deviceId, b.appVersion, b.osVersion, b.platform, col("kind"), col("cardId"), col("ts"), col("source"),
      col("output"), col("vote"), col("reason"), col("outcome"), col("tone"), col("changeSize"),
      col("appCategory"), col("lenBucket"), col("ref"), col("answer"), b.product],
  );
  return r.rowCount ?? 0;
}

/** 删除我上传的内容: every sample from this device. */
export async function deleteDeviceSamples(deviceId: string): Promise<number> {
  await ensureSchema();
  return (await db().query("DELETE FROM samples WHERE device_id = $1", [deviceId])).rowCount ?? 0;
}

/** Deletes samples received more than RETENTION_DAYS ago. */
export async function purgeSamples(): Promise<number> {
  await ensureSchema();
  const r = await db().query(`DELETE FROM samples WHERE received_at < now() - interval '${RETENTION_DAYS} days'`);
  return r.rowCount ?? 0;
}

/** Stores 打字明细 records; a resent commit is ignored, a resent card updates its outcome. */
export async function storeTyping(b: TypingBatch): Promise<number> {
  await ensureSchema();
  if (b.records.length === 0) return 0;
  const col = <T>(f: (r: TypingBatch["records"][number]) => T) => b.records.map(f);
  const r = await db().query(
    `INSERT INTO typing_log (device_id, app_version, os_version, platform, product, notice_version,
       rid, type, ts, app_category, text, via, card_id, kind, lang_pair, source, output, tone, outcome)
     SELECT $1, $2, $3, $4, $5, $6, t.rid, t.type, to_timestamp(t.ts / 1000.0), t.app_category, t.text, t.via,
       t.card_id, t.kind, t.lang_pair, t.source, t.output, t.tone, t.outcome
     FROM unnest($7::uuid[], $8::text[], $9::float8[], $10::text[], $11::text[], $12::text[], $13::uuid[], $14::text[],
       $15::text[], $16::text[], $17::text[], $18::text[], $19::text[])
       AS t(rid, type, ts, app_category, text, via, card_id, kind, lang_pair, source, output, tone, outcome)
     ON CONFLICT (device_id, rid) DO UPDATE SET outcome = EXCLUDED.outcome, output = EXCLUDED.output, tone = EXCLUDED.tone,
       received_at = now()
       WHERE typing_log.type = 'card' AND EXCLUDED.type = 'card'`,
    [b.deviceId, b.appVersion, b.osVersion, b.platform, b.product, b.noticeVersion,
      col((x) => x.rid), col((x) => x.type), col((x) => x.ts), col((x) => x.appCategory),
      col((x) => (x.type === "commit" ? x.text : null)), col((x) => (x.type === "commit" ? x.via : null)),
      col((x) => (x.type === "card" ? x.cardId : null)), col((x) => (x.type === "card" ? x.kind : null)),
      col((x) => (x.type === "card" ? x.langPair : null)), col((x) => (x.type === "card" ? x.source : null)),
      col((x) => (x.type === "card" ? x.output : null)), col((x) => (x.type === "card" ? x.tone : null)),
      col((x) => (x.type === "card" ? x.outcome : null))],
  );
  return r.rowCount ?? 0;
}

/** 删除我的打字记录: every record from this device. */
export async function deleteDeviceTyping(deviceId: string): Promise<number> {
  await ensureSchema();
  return (await db().query("DELETE FROM typing_log WHERE device_id = $1", [deviceId])).rowCount ?? 0;
}

/** Deletes 打字明细 received more than TYPING_RETENTION_DAYS ago. */
export async function purgeTyping(): Promise<number> {
  await ensureSchema();
  const r = await db().query(`DELETE FROM typing_log WHERE received_at < now() - interval '${TYPING_RETENTION_DAYS} days'`);
  return r.rowCount ?? 0;
}
