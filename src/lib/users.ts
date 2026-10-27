import { db, ensureSchema } from "./db";

// The 用户 pages: one row per device, keyed by the anonymous device_id (a
// random UUID the client generates). Definitions follow lib/stats.ts.
//
// 用户码 = the first 8 hex digits of device_id, upper case, shown as XXXX-XXXX.
// device_id "0a1b2c3d-4e5f-…" -> "0A1B-2C3D". The client shows the same code
// in Settings, so a user can read it out and we can find them here.

const DAY = `(ts AT TIME ZONE 'Asia/Shanghai')::date`;
const TODAY = `(now() AT TIME ZONE 'Asia/Shanghai')::date`;
const OK = `coalesce((props->>'ok')::boolean, true)`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEARNING_IN = ["new_word_clicked", "gloss_clicked", "recall_clicked", "word_added_to_book", "dict_opened",
  "learning_dashboard_opened", "word_marked_known", "word_reviewed"].map((n) => `'${n}'`).join(",");
const PLATFORM = `coalesce(platform, CASE WHEN os_version ILIKE 'windows%' THEN 'windows' ELSE 'mac' END)`;
/** Retention windows (days after install): 第 1 / 3 / 7 / 14 天 = day 1 / 3–4 / 7–9 / 14–16. */
export const RET_WINDOWS = [[1, 1, 1], [3, 3, 4], [7, 7, 9], [14, 14, 16]] as const;

export const NAME_MAX = 32;

/** 用户码 for a device id: first 8 hex digits, upper case, as XXXX-XXXX. */
export function userCode(deviceId: string): string {
  const h = deviceId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}

export const isDeviceId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A 备注名 as stored: trimmed, at most NAME_MAX characters, no control characters. "" clears it; null = invalid. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if ([...s].length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

/**
 * The search box: a 用户码 (any case, with or without the dash, or its start),
 * a full device id, or part of a 备注名.
 */
export function searchTerms(q: string): { hexPrefix: string | null; deviceId: string | null; name: string | null } {
  const s = q.trim();
  if (!s) return { hexPrefix: null, deviceId: null, name: null };
  if (UUID.test(s)) return { hexPrefix: null, deviceId: s.toLowerCase(), name: null };
  const hex = s.replace(/[-\s]/g, "");
  return { hexPrefix: /^[0-9a-f]{1,8}$/i.test(hex) ? hex.toLowerCase() : null, deviceId: null, name: s };
}

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(sql, params)).rows as T[];
}

export async function setName(deviceId: string, name: string): Promise<void> {
  await ensureSchema();
  if (name === "") await db().query("DELETE FROM device_names WHERE device_id = $1", [deviceId]);
  else await db().query(
    `INSERT INTO device_names (device_id, name) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`, [deviceId, name]);
}

// Shared per-device CTEs. `$1` is null (every device) or one device id.
const BASE = `
  ev AS (SELECT * FROM events WHERE $1::uuid IS NULL OR device_id = $1::uuid),
  bt AS (SELECT * FROM batches WHERE $1::uuid IS NULL OR device_id = $1::uuid),
  latest AS (
    SELECT DISTINCT ON (device_id) device_id, app_version, os_version, ${PLATFORM} AS platform, channel
    FROM bt ORDER BY device_id, received_at DESC
  ),
  inst AS (
    SELECT device_id, min(x) AS d0 FROM (
      SELECT device_id, install_date AS x FROM bt WHERE install_date IS NOT NULL
      UNION ALL SELECT device_id, ${DAY} FROM ev WHERE name IN ('install', 'input_source_added')
    ) i GROUP BY 1
  ),
  td AS (
    SELECT device_id, (props->>'day')::date AS day, max((props->>'commits')::int) AS commits,
      max((props->>'chars')::int) AS chars, max((props->>'away_30m')::int) AS away
    FROM ev WHERE name = 'input_time_daily' AND props ? 'day' GROUP BY 1, 2
  ),
  sd AS (SELECT DISTINCT device_id, ${DAY} AS day FROM ev),
  -- Active per device-day: >= 1 commit when that day has input_time_daily, else any report that day.
  ad AS (
    SELECT device_id, day, false AS fb FROM td WHERE commits >= 1
    UNION ALL
    SELECT sd.device_id, sd.day, true FROM sd LEFT JOIN td USING (device_id, day) WHERE td.commits IS NULL AND td.chars IS NULL
  )`;

export interface UserRow {
  device_id: string; name: string | null; platform: string | null; app_version: string | null; channel: string | null;
  install_day: string | null; first_seen: string | null; last_seen: string | null; active_days: number; last_active: string | null;
  shown: number; adopted: number; glanced: number; p_shown: number; p_accepted: number; samples: number;
}

/** Every device (or only `only`), newest activity first, filtered by the search box. */
export async function listUsers(search: string, only: string | null = null): Promise<UserRow[]> {
  await ensureSchema();
  const t = searchTerms(search);
  return q<UserRow>(`
    WITH ${BASE},
    seen AS (
      SELECT device_id, min(ts) AS first_ts, max(ts) AS last_ts FROM (
        SELECT device_id, ts FROM ev UNION ALL SELECT device_id, received_at FROM bt) x GROUP BY 1
    ),
    act AS (SELECT device_id, count(*)::int AS days, max(day) AS last_active FROM ad GROUP BY 1),
    cards AS (
      SELECT device_id,
        count(DISTINCT coalesce(props->>'card_id', 'e' || id)) FILTER (WHERE name = 'card_shown')::int AS shown,
        count(DISTINCT coalesce(props->>'card_id', 'e' || id)) FILTER (WHERE name = 'card_replaced' AND ${OK})::int AS adopted,
        count(DISTINCT coalesce(props->>'card_id', 'e' || id)) FILTER (WHERE name = 'card_glanced')::int AS glanced,
        count(DISTINCT props->>'card_id') FILTER (WHERE name = 'polish_shown')::int AS p_shown,
        count(DISTINCT props->>'card_id') FILTER (WHERE name = 'polish_accepted' AND ${OK})::int AS p_accepted
      FROM ev WHERE name IN ('card_shown', 'card_replaced', 'card_glanced', 'polish_shown', 'polish_accepted') GROUP BY 1
    ),
    smp AS (SELECT device_id, count(*)::int AS n FROM samples WHERE $1::uuid IS NULL OR device_id = $1::uuid GROUP BY 1)
    SELECT l.device_id, n.name, l.platform, l.app_version, l.channel,
      to_char(inst.d0, 'YYYY-MM-DD') AS install_day,
      to_char(seen.first_ts AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS first_seen,
      to_char(seen.last_ts AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS last_seen,
      coalesce(act.days, 0) AS active_days, to_char(act.last_active, 'YYYY-MM-DD') AS last_active,
      coalesce(cards.shown, 0) AS shown, coalesce(cards.adopted, 0) AS adopted, coalesce(cards.glanced, 0) AS glanced,
      coalesce(cards.p_shown, 0) AS p_shown, coalesce(cards.p_accepted, 0) AS p_accepted, coalesce(smp.n, 0) AS samples
    FROM latest l
    LEFT JOIN device_names n USING (device_id) LEFT JOIN inst USING (device_id) LEFT JOIN seen USING (device_id)
    LEFT JOIN act USING (device_id) LEFT JOIN cards USING (device_id) LEFT JOIN smp USING (device_id)
    WHERE ($2::text IS NULL AND $3::uuid IS NULL AND $4::text IS NULL)
       OR l.device_id = $3::uuid
       OR ($2::text IS NOT NULL AND l.device_id::text LIKE $2 || '%')
       OR ($4::text IS NOT NULL AND n.name ILIKE '%' || replace(replace(replace($4, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%')
    ORDER BY seen.last_ts DESC NULLS LAST`, [only, t.hexPrefix, t.deviceId, t.name]);
}

export interface DayRow {
  day: string; reports: number;
  active: boolean; active_fb: boolean; main: boolean | null;
  commits: number | null; chars: number | null; en_typed: number | null; en_card: number | null; typing_min: number | null;
  away_30m: number | null; switch_away: number | null; translate_on: boolean | null; polish_on: boolean | null;
  ts_commits: number; ts_first_hit: number; ts_chars: number; ts_en_chars: number; ts_abandoned: number;
  shown: number; glanced: number; adopted: number; undone: number; esc: number; closed: number; away: number;
  up: number; down: number;
  p_shown: number; p_glanced: number; p_accepted: number; p_esc: number; p_closed: number;
  offs: number; ons: number; learn: number;
  lat_n: number; lat_err: number; lat_p50: number | null; p_lat_err: number; crashes: number;
}

export interface AppRow {
  app: string; name: string | null; category: string | null; days_used: number;
  commits: number; first_hit: number; chars: number; en_chars: number;
  shown: number; adopted: number; offs: number;
}

export interface Detail {
  profile: UserRow & { os_version: string | null; english_level: string | null; improve_on: boolean | null;
    onboarded: boolean | null; first_active: string | null };
  days: DayRow[];
  apps: AppRow[];
  retention: { k: number; lo: number; hi: number; due: string; done: boolean; active: boolean; main: boolean }[];
  samples: { kind: string; n: number; up: number; down: number; last: string | null }[];
  events: { time: string; name: string; props: Record<string, unknown> }[];
}

/** Everything about one device; `range` days back from today; `eventDay` lists that day's raw events. */
export async function userDetail(deviceId: string, range: number, eventDay: string | null): Promise<Detail | null> {
  await ensureSchema();
  const [profile] = (await listUsers(deviceId, deviceId)) as Detail["profile"][];
  if (!profile) return null;
  const [extra] = await q<{ os_version: string | null; english_level: string | null; improve_on: boolean | null;
    onboarded: boolean | null; first_active: string | null }>(`
    WITH ${BASE}
    SELECT (SELECT os_version FROM latest) AS os_version,
      (SELECT english_level FROM bt WHERE english_level IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS english_level,
      (SELECT improve_on FROM bt WHERE improve_on IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS improve_on,
      (SELECT onboarded FROM bt WHERE onboarded IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS onboarded,
      (SELECT to_char(min(day), 'YYYY-MM-DD') FROM ad) AS first_active`, [deviceId]);
  Object.assign(profile, extra);

  const R = range;
  const days = await q<DayRow>(`
    WITH ${BASE},
    d AS (SELECT generate_series(${TODAY} - ${R - 1}, ${TODAY}, '1 day')::date AS day),
    win AS (SELECT * FROM ev WHERE ts >= now() - interval '${R + 2} days'),
    daily AS (
      SELECT (props->>'day')::date AS day,
        max((props->>'commits')::int) AS commits, max((props->>'chars')::int) AS chars,
        max((props->>'chars_en_typed')::int) AS en_typed, max((props->>'chars_en_card')::int) AS en_card,
        max((props->>'youdao_typing_min')::int) AS typing_min, max((props->>'away_30m')::int) AS away_30m,
        max((props->>'switch_away')::int) AS switch_away,
        bool_and((props->>'translate_on')::boolean) AS translate_on, bool_and((props->>'polish_on')::boolean) AS polish_on
      FROM win WHERE name = 'input_time_daily' AND props ? 'day' GROUP BY 1
    ),
    evd AS (
      SELECT ${DAY} AS day, count(*)::int AS reports,
        sum((props->>'commits')::int) FILTER (WHERE name = 'typing_stats') AS ts_commits,
        sum((props->>'first_hit')::int) FILTER (WHERE name = 'typing_stats') AS ts_first_hit,
        sum((props->>'chars')::int) FILTER (WHERE name = 'typing_stats') AS ts_chars,
        sum((props->>'en_chars')::int) FILTER (WHERE name = 'typing_stats') AS ts_en_chars,
        sum((props->>'abandoned')::int) FILTER (WHERE name = 'typing_stats') AS ts_abandoned,
        count(*) FILTER (WHERE name = 'translation_turned_off'
          OR (name = 'translation_toggled' AND (props->>'on')::boolean = false)) AS offs,
        count(*) FILTER (WHERE name = 'translation_turned_on'
          OR (name = 'translation_toggled' AND (props->>'on')::boolean = true)) AS ons,
        count(*) FILTER (WHERE name IN (${LEARNING_IN})) AS learn,
        count(*) FILTER (WHERE name = 'sentence_latency') AS lat_n,
        count(*) FILTER (WHERE name = 'sentence_latency' AND NOT ${OK}) AS lat_err,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'ms')::int)
          FILTER (WHERE name = 'sentence_latency' AND ${OK} AND props ? 'ms'))::int AS lat_p50,
        count(*) FILTER (WHERE name = 'polish_latency' AND NOT ${OK}) AS p_lat_err,
        count(*) FILTER (WHERE name = 'ime_restarted' AND coalesce(props->>'kind', 'crash') <> 'system') AS crashes
      FROM win GROUP BY 1
    ),
    -- Card outcomes count on the day the card was shown; of Esc / turn-off / switching away the first one wins.
    card AS (
      SELECT coalesce(props->>'card_id', props->>'recent_card_id') AS cid,
        min(${DAY}) FILTER (WHERE name = 'card_shown') AS cday, min(${DAY}) FILTER (WHERE name = 'polish_shown') AS pday,
        bool_or(name = 'card_glanced') AS glanced, bool_or(name = 'card_replaced' AND ${OK}) AS adopted,
        bool_or(name = 'card_undo_after_replace') AS undone,
        bool_or(name = 'card_feedback' AND props->>'vote' = 'up') AS up,
        bool_or(name = 'card_feedback' AND props->>'vote' = 'down') AS down,
        bool_or(name = 'polish_glanced') AS p_glanced, bool_or(name = 'polish_accepted' AND ${OK}) AS p_accepted,
        (array_agg(CASE WHEN name IN ('card_dismissed', 'polish_dismissed') THEN 'esc' WHEN name = 'ime_deactivated' THEN 'away'
          ELSE 'closed' END ORDER BY ts) FILTER (WHERE name IN ('card_dismissed', 'polish_dismissed', 'card_closed', 'polish_closed',
          'translation_turned_off', 'ime_deactivated') OR (name = 'translation_toggled' AND (props->>'on')::boolean = false)))[1] AS dis
      FROM win WHERE props ? 'card_id' OR props ? 'recent_card_id' GROUP BY 1
    ),
    cd AS (
      SELECT cday AS day, count(*) AS shown, count(*) FILTER (WHERE glanced) AS glanced, count(*) FILTER (WHERE adopted) AS adopted,
        count(*) FILTER (WHERE undone) AS undone, count(*) FILTER (WHERE dis = 'esc') AS esc,
        count(*) FILTER (WHERE dis = 'closed') AS closed, count(*) FILTER (WHERE dis = 'away') AS away,
        count(*) FILTER (WHERE up) AS up, count(*) FILTER (WHERE down) AS down
      FROM card WHERE cday IS NOT NULL GROUP BY 1
    ),
    pd AS (
      SELECT pday AS day, count(*) AS p_shown, count(*) FILTER (WHERE p_glanced) AS p_glanced,
        count(*) FILTER (WHERE p_accepted) AS p_accepted, count(*) FILTER (WHERE dis = 'esc') AS p_esc,
        count(*) FILTER (WHERE dis = 'closed') AS p_closed
      FROM card WHERE pday IS NOT NULL GROUP BY 1
    ),
    -- Old clients send no card_id: their cards count per event.
    legacy AS (
      SELECT ${DAY} AS day, count(*) FILTER (WHERE name = 'card_shown') AS shown,
        count(*) FILTER (WHERE name = 'card_replaced' AND ${OK}) AS adopted
      FROM win WHERE name IN ('card_shown', 'card_replaced') AND NOT props ? 'card_id' GROUP BY 1
    ),
    a AS (SELECT day, bool_or(true) AS active, bool_and(fb) AS fb FROM ad GROUP BY 1)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(evd.reports, 0) AS reports,
      coalesce(a.active, false) AS active, coalesce(a.fb, false) AS active_fb,
      CASE WHEN daily.chars IS NULL THEN NULL ELSE daily.chars >= 200 AND coalesce(daily.away_30m, 0) <= 1 END AS main,
      daily.commits, daily.chars, daily.en_typed, daily.en_card, daily.typing_min, daily.away_30m, daily.switch_away,
      daily.translate_on, daily.polish_on,
      coalesce(evd.ts_commits, 0)::int AS ts_commits, coalesce(evd.ts_first_hit, 0)::int AS ts_first_hit,
      coalesce(evd.ts_chars, 0)::int AS ts_chars, coalesce(evd.ts_en_chars, 0)::int AS ts_en_chars,
      coalesce(evd.ts_abandoned, 0)::int AS ts_abandoned,
      (coalesce(cd.shown, 0) + coalesce(legacy.shown, 0))::int AS shown, coalesce(cd.glanced, 0)::int AS glanced,
      (coalesce(cd.adopted, 0) + coalesce(legacy.adopted, 0))::int AS adopted, coalesce(cd.undone, 0)::int AS undone,
      coalesce(cd.esc, 0)::int AS esc, coalesce(cd.closed, 0)::int AS closed, coalesce(cd.away, 0)::int AS away,
      coalesce(cd.up, 0)::int AS up, coalesce(cd.down, 0)::int AS down,
      coalesce(pd.p_shown, 0)::int AS p_shown, coalesce(pd.p_glanced, 0)::int AS p_glanced,
      coalesce(pd.p_accepted, 0)::int AS p_accepted, coalesce(pd.p_esc, 0)::int AS p_esc, coalesce(pd.p_closed, 0)::int AS p_closed,
      coalesce(evd.offs, 0)::int AS offs, coalesce(evd.ons, 0)::int AS ons, coalesce(evd.learn, 0)::int AS learn,
      coalesce(evd.lat_n, 0)::int AS lat_n, coalesce(evd.lat_err, 0)::int AS lat_err, evd.lat_p50,
      coalesce(evd.p_lat_err, 0)::int AS p_lat_err, coalesce(evd.crashes, 0)::int AS crashes
    FROM d LEFT JOIN evd USING (day) LEFT JOIN daily USING (day) LEFT JOIN cd USING (day) LEFT JOIN pd USING (day)
      LEFT JOIN legacy USING (day) LEFT JOIN a USING (day)
    ORDER BY d.day DESC`, [deviceId]);

  const apps = await q<AppRow>(`
    WITH win AS (SELECT * FROM events WHERE device_id = $1::uuid AND ts >= now() - interval '${R} days'),
    used AS (
      SELECT lower(props->>'bundle_id') AS app, count(DISTINCT ${DAY})::int AS days_used,
        (array_agg(props->>'app_name' ORDER BY ts DESC) FILTER (WHERE props ? 'app_name'))[1] AS name,
        (array_agg(props->>'app_category' ORDER BY ts DESC) FILTER (WHERE props ? 'app_category'))[1] AS category
      FROM win WHERE name = 'app_used' AND props ? 'bundle_id' GROUP BY 1
    ),
    ty AS (
      SELECT lower(props->>'bundle_id') AS app, sum((props->>'commits')::int)::int AS commits,
        sum((props->>'first_hit')::int)::int AS first_hit, sum((props->>'chars')::int)::int AS chars,
        sum((props->>'en_chars')::int)::int AS en_chars,
        (array_agg(props->>'app_category' ORDER BY ts DESC) FILTER (WHERE props ? 'app_category'))[1] AS category
      FROM win WHERE name = 'typing_stats' AND props ? 'bundle_id' GROUP BY 1
    ),
    cs AS (
      SELECT max(lower(props->>'bundle_id')) AS app, props->>'card_id' AS cid
      FROM win WHERE name = 'card_shown' AND props ? 'bundle_id' AND props ? 'card_id' GROUP BY 2
    ),
    cr AS (SELECT DISTINCT props->>'card_id' AS cid FROM win WHERE name = 'card_replaced' AND ${OK} AND props ? 'card_id'),
    cv AS (SELECT app, count(*)::int AS shown, count(cr.cid)::int AS adopted FROM cs LEFT JOIN cr USING (cid) GROUP BY 1),
    offs AS (SELECT lower(props->>'bundle_id') AS app, count(*)::int AS offs FROM win
      WHERE name = 'translation_turned_off' AND props ? 'bundle_id' GROUP BY 1),
    apps AS (SELECT app FROM used UNION SELECT app FROM ty UNION SELECT app FROM cv UNION SELECT app FROM offs)
    SELECT apps.app, used.name, coalesce(used.category, ty.category) AS category, coalesce(used.days_used, 0) AS days_used,
      coalesce(ty.commits, 0) AS commits, coalesce(ty.first_hit, 0) AS first_hit, coalesce(ty.chars, 0) AS chars,
      coalesce(ty.en_chars, 0) AS en_chars, coalesce(cv.shown, 0) AS shown, coalesce(cv.adopted, 0) AS adopted,
      coalesce(offs.offs, 0) AS offs
    FROM apps LEFT JOIN used USING (app) LEFT JOIN ty USING (app) LEFT JOIN cv USING (app) LEFT JOIN offs USING (app)
    ORDER BY coalesce(ty.chars, 0) + coalesce(ty.en_chars, 0) DESC, coalesce(used.days_used, 0) DESC, apps.app`, [deviceId]);

  const retention = await q<Detail["retention"][number]>(`
    WITH ${BASE},
    w(k, lo, hi) AS (VALUES ${RET_WINDOWS.map(([k, lo, hi]) => `(${k}, ${lo}, ${hi})`).join(", ")})
    SELECT w.k, w.lo, w.hi, to_char(inst.d0 + w.hi + 1, 'MM-DD') AS due, ${TODAY} - inst.d0 > w.hi AS done,
      EXISTS (SELECT 1 FROM ad WHERE ad.day - inst.d0 BETWEEN w.lo AND w.hi) AS active,
      EXISTS (SELECT 1 FROM td WHERE td.day - inst.d0 BETWEEN w.lo AND w.hi
        AND coalesce(td.chars, 0) >= 200 AND coalesce(td.away, 0) <= 1) AS main
    FROM inst CROSS JOIN w ORDER BY w.k`, [deviceId]);

  const samples = await q<Detail["samples"][number]>(`
    SELECT kind, count(*)::int AS n, count(*) FILTER (WHERE vote = 'up')::int AS up,
      count(*) FILTER (WHERE vote = 'down')::int AS down,
      to_char(max(received_at) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS last
    FROM samples WHERE device_id = $1::uuid GROUP BY 1 ORDER BY 1`, [deviceId]);

  const events = eventDay ? await q<Detail["events"][number]>(`
    SELECT to_char(ts AT TIME ZONE 'Asia/Shanghai', 'HH24:MI:SS') AS time, name, props
    FROM events WHERE device_id = $1::uuid AND ${DAY} = $2::date ORDER BY ts, id LIMIT 1000`, [deviceId, eventDay]) : [];

  return { profile, days, apps, retention, samples, events };
}
