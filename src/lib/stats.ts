import { db, ensureSchema } from "./db";

// Days are counted in Beijing time: that is when the users' days start.
const DAY = `(ts AT TIME ZONE 'Asia/Shanghai')::date`;
const SINCE = (days: number) => `ts >= now() - interval '${days} days'`;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(sql, params)).rows as T[];
}

export interface Overview {
  devices: number; installs: number; active1: number; active7: number; active30: number; events: number;
}
export interface Day {
  day: string; active: number; installs: number; shown: number; replaced: number; dismissed: number;
  gloss: number; p50: number | null;
}
export interface ToneRow {
  tone: string; shown: number; replaced: number; failed: number; dismissed: number; undone: number;
}
export interface Count { label: string; n: number }
export interface Latency { n: number; errors: number; p50: number | null; p90: number | null; p95: number | null }
export interface AppRow { bundle_id: string; app_name: string | null; devices: number; n: number }

export async function loadStats() {
  await ensureSchema();
  const [overview] = await q<Overview>(`
    SELECT
      (SELECT count(DISTINCT device_id) FROM batches)::int AS devices,
      (SELECT count(DISTINCT device_id) FROM events WHERE name = 'install')::int AS installs,
      (SELECT count(DISTINCT device_id) FROM events WHERE ${DAY} = (now() AT TIME ZONE 'Asia/Shanghai')::date)::int AS active1,
      (SELECT count(DISTINCT device_id) FROM events WHERE ${SINCE(7)})::int AS active7,
      (SELECT count(DISTINCT device_id) FROM events WHERE ${SINCE(30)})::int AS active30,
      (SELECT count(*) FROM events)::int AS events`);

  const days = await q<Day>(`
    WITH d AS (
      SELECT generate_series((now() AT TIME ZONE 'Asia/Shanghai')::date - 29,
                             (now() AT TIME ZONE 'Asia/Shanghai')::date, '1 day')::date AS day
    ), e AS (
      SELECT ${DAY} AS day, device_id, name, props FROM events WHERE ${SINCE(31)}
    )
    SELECT to_char(d.day, 'MM-DD') AS day,
      count(DISTINCT e.device_id)::int AS active,
      count(*) FILTER (WHERE e.name = 'install')::int AS installs,
      count(*) FILTER (WHERE e.name = 'card_shown')::int AS shown,
      count(*) FILTER (WHERE e.name = 'card_replaced' AND (e.props->>'ok')::boolean)::int AS replaced,
      count(*) FILTER (WHERE e.name = 'card_dismissed')::int AS dismissed,
      count(*) FILTER (WHERE e.name = 'gloss_shown')::int AS gloss,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.props->>'ms')::int)
            FILTER (WHERE e.name = 'sentence_latency' AND (e.props->>'ok')::boolean))::int AS p50
    FROM d LEFT JOIN e ON e.day = d.day
    GROUP BY d.day ORDER BY d.day DESC`);

  const tones = await q<ToneRow>(`
    SELECT coalesce(props->>'tone', '?') AS tone,
      count(*) FILTER (WHERE name = 'card_shown')::int AS shown,
      count(*) FILTER (WHERE name = 'card_replaced' AND (props->>'ok')::boolean)::int AS replaced,
      count(*) FILTER (WHERE name = 'card_replaced' AND NOT (props->>'ok')::boolean)::int AS failed,
      count(*) FILTER (WHERE name IN ('card_dismissed', 'card_ignored'))::int AS dismissed,
      count(*) FILTER (WHERE name = 'card_undo_after_replace')::int AS undone
    FROM events
    WHERE ${SINCE(7)} AND name IN ('card_shown','card_replaced','card_dismissed','card_ignored','card_undo_after_replace')
    GROUP BY 1 ORDER BY shown DESC`);

  const methods = await q<Count>(`
    SELECT props->>'method' AS label, count(*)::int AS n FROM events
    WHERE ${SINCE(7)} AND name = 'card_replaced' AND (props->>'ok')::boolean
    GROUP BY 1 ORDER BY n DESC`);

  const failures = await q<Count>(`
    SELECT coalesce(props->>'fail_reason', '?') AS label, count(*)::int AS n FROM events
    WHERE ${SINCE(7)} AND name = 'card_replaced' AND NOT (props->>'ok')::boolean
    GROUP BY 1 ORDER BY n DESC LIMIT 10`);

  const [latency] = await q<Latency>(`
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE NOT (props->>'ok')::boolean)::int AS errors,
      round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE (props->>'ok')::boolean))::int AS p50,
      round(percentile_cont(0.9)  WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE (props->>'ok')::boolean))::int AS p90,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE (props->>'ok')::boolean))::int AS p95
    FROM events WHERE ${SINCE(7)} AND name = 'sentence_latency' AND props ? 'ms'`);

  const errorCodes = await q<Count>(`
    SELECT coalesce(props->>'error_code', '?') AS label, count(*)::int AS n FROM events
    WHERE ${SINCE(7)} AND name = 'sentence_latency' AND NOT (props->>'ok')::boolean
    GROUP BY 1 ORDER BY n DESC LIMIT 10`);

  const learning = await q<Count>(`
    SELECT name AS label, count(*)::int AS n FROM events
    WHERE ${SINCE(7)} AND name IN ('gloss_shown','dict_opened','new_word_shown','new_word_clicked',
                                   'recall_shown','recall_clicked','tone_switched')
    GROUP BY 1`);

  const apps = await q<AppRow>(`
    SELECT props->>'bundle_id' AS bundle_id,
      (array_agg(props->>'app_name' ORDER BY ts DESC) FILTER (WHERE props ? 'app_name'))[1] AS app_name,
      count(DISTINCT device_id)::int AS devices, count(*)::int AS n
    FROM events WHERE ${SINCE(7)} AND name = 'app_used' AND props ? 'bundle_id'
    GROUP BY 1 ORDER BY devices DESC, n DESC LIMIT 20`);

  const candidates = await q<Count>(`
    SELECT CASE WHEN (props->>'index')::int >= 9 THEN '9+' ELSE props->>'index' END AS label,
      count(*)::int AS n
    FROM events WHERE ${SINCE(7)} AND name = 'candidate_index_chosen' AND props ? 'index'
    GROUP BY 1 ORDER BY min((props->>'index')::int)`);

  const versions = await q<Count>(`
    SELECT app_version || ' · macOS ' || os_version AS label, count(*)::int AS n FROM (
      SELECT DISTINCT ON (device_id) device_id, app_version, os_version FROM batches
      WHERE received_at >= now() - interval '30 days'
      ORDER BY device_id, received_at DESC) latest
    GROUP BY 1 ORDER BY n DESC LIMIT 15`);

  const levels = await q<Count>(`
    SELECT (CASE kind WHEN 'english' THEN '英文水平 ' ELSE '生词频率 ' END) || level AS label, count(*)::int AS n FROM (
      SELECT DISTINCT ON (device_id, props->>'kind') props->>'kind' AS kind, props->>'level' AS level
      FROM events WHERE name = 'level_setting' AND props ? 'level'
      ORDER BY device_id, props->>'kind', ts DESC) latest
    GROUP BY kind, level ORDER BY kind, n DESC`);

  const settings = await q<Count>(`
    SELECT props->>'key' AS label, count(*)::int AS n FROM events
    WHERE ${SINCE(30)} AND name = 'setting_changed' AND props ? 'key'
    GROUP BY 1 ORDER BY n DESC LIMIT 15`);

  return { overview, days, tones, methods, failures, latency, errorCodes, learning, apps, candidates, versions, levels, settings };
}

export type Stats = Awaited<ReturnType<typeof loadStats>>;
