import { db, ensureSchema } from "./db";

// Metrics follow docs/beta-metrics-plan.md. Days are Beijing days; day 0 is
// the install day; weeks start Monday 00:00 Beijing time.
const DAY = `(ts AT TIME ZONE 'Asia/Shanghai')::date`;
const TODAY = `(now() AT TIME ZONE 'Asia/Shanghai')::date`;
const SINCE = (days: number) => `ts >= now() - interval '${days} days'`;
const OK = `coalesce((props->>'ok')::boolean, true)`;
/**
 * Attributes card events to the day their card was shown. Expects a `raw` CTE
 * (day, name, cid, has_id, props). Events with a card_id whose card was not
 * shown in the window get a null day; events without a card_id (old clients)
 * keep their own day. `sp` is the shown event's props, for per-card dimensions.
 */
const SHOWN_DAY = (shownName: string) => `
    sh AS (SELECT DISTINCT ON (cid) cid, day, props AS sp FROM raw WHERE name = '${shownName}' ORDER BY cid, day),
    att AS (
      SELECT CASE WHEN r.has_id THEN sh.day ELSE r.day END AS day, r.name, r.cid, r.props, sh.sp
      FROM raw r LEFT JOIN sh USING (cid)
    )`;
const LEARNING_EVENTS = [
  "new_word_clicked", "gloss_clicked", "recall_clicked", "word_added_to_book",
  "dict_opened", "learning_dashboard_opened", "word_marked_known", "word_reviewed",
] as const;
const LEARNING_IN = LEARNING_EVENTS.map((n) => `'${n}'`).join(",");

export type Platform = "mac" | "windows";
export type Cohort = "day" | "week";
export const RANGES = [7, 14, 30, 90] as const;
export interface Filters { platform: Platform | null; strict: boolean; cohort: Cohort; range: number }

// Clients before the beta plan send no `platform`; Windows builds send
// os_version "windows 10.0.x", so that is used as the fallback.
const DEVICE_PLATFORM = `
  SELECT DISTINCT ON (device_id) device_id,
    coalesce(platform, CASE WHEN os_version ILIKE 'windows%' THEN 'windows' ELSE 'mac' END) AS platform
  FROM batches ORDER BY device_id, received_at DESC`;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(sql, params)).rows as T[];
}

export interface Count { label: string; n: number }
export interface Rate { label: string; num: number; den: number }

/** Which events (and which props on them) have arrived in the last 90 days. */
export type Presence = Record<string, string[]>;

export async function loadStats(f: Filters) {
  await ensureSchema();
  // `platform` is checked against the two literals before it is inlined.
  const scope = f.platform === "mac" || f.platform === "windows"
    ? `AND device_id IN (SELECT device_id FROM (${DEVICE_PLATFORM}) dp WHERE platform = '${f.platform}')`
    : "";
  const EV = (days: number) => `(SELECT * FROM events WHERE ${SINCE(days)} ${scope})`;
  const ALL = `(SELECT * FROM events WHERE TRUE ${scope})`;
  // The shared date range, in days (validated against RANGES before it is inlined).
  const R = (RANGES as readonly number[]).includes(f.range) ? f.range : 7;

  const presenceRows = await q<{ name: string; keys: string[] }>(`
    SELECT e.name, coalesce(array_agg(DISTINCT k) FILTER (WHERE k IS NOT NULL), '{}') AS keys
    FROM events e LEFT JOIN LATERAL jsonb_object_keys(e.props) AS k ON true
    WHERE e.ts >= now() - interval '90 days' GROUP BY e.name`);
  const presence: Presence = Object.fromEntries(presenceRows.map((r) => [r.name, r.keys]));
  const [meta] = await q<{ platform: number; english_level: number; install_date: number; improve_on: number }>(`
    SELECT count(*) FILTER (WHERE platform IS NOT NULL)::int AS platform,
      count(*) FILTER (WHERE english_level IS NOT NULL)::int AS english_level,
      count(*) FILTER (WHERE install_date IS NOT NULL)::int AS install_date,
      count(*) FILTER (WHERE improve_on IS NOT NULL)::int AS improve_on
    FROM batches WHERE received_at >= now() - interval '90 days'`);

  const [overview] = await q<{ devices: number; installs: number; today: number; active7: number; events7: number }>(`
    SELECT
      (SELECT count(DISTINCT device_id) FROM ${ALL} e)::int AS devices,
      (SELECT count(DISTINCT device_id) FROM ${ALL} e WHERE name = 'input_source_added')::int AS installs,
      (SELECT count(DISTINCT device_id) FROM ${EV(2)} e WHERE ${DAY} = ${TODAY})::int AS today,
      (SELECT count(DISTINCT device_id) FROM ${EV(R)} e)::int AS active7,
      (SELECT count(*) FROM ${EV(R)} e)::int AS events7`);

  // ---------- Overview: this range ("cur") against the range before it ("prev") ----------
  const R2 = 2 * R;
  const series = await q<{ day: string; cur: boolean; seen: number; active: number; shown: number; adopted: number; glanced: number }>(`
    WITH d AS (SELECT generate_series(${TODAY} - ${R2 - 1}, ${TODAY}, '1 day')::date AS day),
    ev AS ${EV(R2 + 1)},
    raw AS (
      SELECT ${DAY} AS day, name, coalesce(props->>'card_id', 'e' || id) AS cid, props ? 'card_id' AS has_id, props
      FROM ev WHERE name IN ('card_shown', 'card_replaced', 'card_glanced')
    ),
    ${SHOWN_DAY("card_shown")},
    c AS (
      SELECT day, count(DISTINCT cid) FILTER (WHERE name = 'card_shown') AS shown,
        count(DISTINCT cid) FILTER (WHERE name = 'card_replaced' AND ${OK}) AS adopted,
        count(DISTINCT cid) FILTER (WHERE name = 'card_glanced') AS glanced
      FROM att GROUP BY day
    ),
    seen AS (SELECT ${DAY} AS day, count(DISTINCT device_id) AS n FROM ev GROUP BY 1),
    act AS (
      SELECT (props->>'day')::date AS day, count(DISTINCT device_id) AS n FROM ev
      WHERE name = 'input_time_daily' AND props ? 'day' AND coalesce((props->>'commits')::int, 0) >= 1 GROUP BY 1
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.day > ${TODAY} - ${R} AS cur,
      coalesce(seen.n, 0)::int AS seen, coalesce(act.n, 0)::int AS active, coalesce(c.shown, 0)::int AS shown,
      coalesce(c.adopted, 0)::int AS adopted, coalesce(c.glanced, 0)::int AS glanced
    FROM d LEFT JOIN seen USING (day) LEFT JOIN act USING (day) LEFT JOIN c USING (day) ORDER BY d.day`);
  // ---------- 基础数据: one row per day over both periods ----------
  // Whether any input_time_daily has arrived; "active" itself falls back per device-day (see `a` / ACT).
  const officialActive = (presence.input_time_daily ?? []).includes("commits");
  const dailyCond = f.strict ? `coalesce(chars, 0) >= 20` : `coalesce(commits, 0) >= 1`;
  const VKEY = `string_to_array(substring(app_version from '^[0-9]+(?:[.][0-9]+)*'), '.')::int[]`;
  const BATCH_DAY = `(received_at AT TIME ZONE 'Asia/Shanghai')::date`;
  const basics = await q<{
    day: string; cur: boolean; inst_new: number; inst_cum: number; imported: number; onb_n: number; onb_done: number;
    dau: number; dau_fb: number; wau: number; seen: number; mac: number; ver_n: number; ver_latest: number;
    dd: number; mins: number; chars: number; en: number; t_n: number; t_off: number;
    cards: number; learn: number; learn_dev: number; crashes: number; api_n: number; api_err: number;
    imp_n: number; imp_off: number;
  }>(`
    WITH d AS (SELECT generate_series(${TODAY} - ${R2 - 1}, ${TODAY}, '1 day')::date AS day),
    ev AS ${EV(R2 + 8)},
    allev AS ${ALL},
    inst AS (
      SELECT device_id, min(x) AS d0 FROM (
        SELECT device_id, install_date AS x FROM batches WHERE install_date IS NOT NULL
        UNION ALL
        SELECT device_id, ${DAY} FROM allev WHERE name IN ('install', 'input_source_added')
      ) i GROUP BY device_id
    ),
    cohort AS (SELECT device_id, d0 FROM inst WHERE device_id IN (SELECT device_id FROM allev WHERE name = 'input_source_added')),
    imp AS (SELECT DISTINCT device_id FROM allev WHERE name = 'dict_import' AND coalesce((props->>'added')::int, 0) > 0),
    onb AS (SELECT device_id, min(${DAY}) AS day FROM allev WHERE name = 'onboarding_shown' GROUP BY 1),
    onb_done AS (SELECT DISTINCT device_id FROM allev WHERE name = 'onboarding_completed'),
    seen AS (SELECT DISTINCT device_id, ${DAY} AS day FROM ev),
    td AS (
      SELECT device_id, (props->>'day')::date AS day,
        max((props->>'commits')::int) AS commits, max((props->>'chars')::int) AS chars,
        max((props->>'chars_en_typed')::int) AS en, max((props->>'youdao_typing_min')::int) AS mins,
        bool_or(props ? 'translate_on') AS t_has, bool_or((props->>'translate_on')::boolean = false) AS t_off
      FROM ev WHERE name = 'input_time_daily' AND props ? 'day' GROUP BY 1, 2
    ),
    act AS (SELECT device_id, day FROM td WHERE ${dailyCond}),
    -- Per device-day: input_time_daily decides when that day has one, else any report counts (fb).
    a AS (
      SELECT device_id, day, false AS fb FROM act
      UNION ALL
      SELECT s.device_id, s.day, true FROM seen s LEFT JOIN td USING (device_id, day)
      WHERE td.commits IS NULL AND td.chars IS NULL
    ),
    dp AS (${DEVICE_PLATFORM}),
    vb AS (
      SELECT device_id, ${BATCH_DAY} AS day,
        coalesce(platform, CASE WHEN os_version ILIKE 'windows%' THEN 'windows' ELSE 'mac' END) AS platform,
        max(${VKEY}) AS v
      FROM batches WHERE received_at >= now() - interval '${R2 + 60} days' ${scope} GROUP BY 1, 2, 3
    ),
    -- "Latest" is the newest version any device on that platform had reported by that day.
    lat AS (SELECT day, platform, max(max(v)) OVER (PARTITION BY platform ORDER BY day) AS latest FROM vb GROUP BY 1, 2),
    imprv AS (
      SELECT DISTINCT ON (device_id, ${BATCH_DAY}) ${BATCH_DAY} AS day, improve_on FROM batches
      WHERE improve_on IS NOT NULL AND received_at >= now() - interval '${R2 + 1} days' ${scope}
      ORDER BY device_id, ${BATCH_DAY}, received_at DESC
    ),
    evd AS (
      SELECT ${DAY} AS day,
        count(DISTINCT coalesce(props->>'card_id', 'e' || id)) FILTER (WHERE name = 'card_shown') AS cards,
        count(*) FILTER (WHERE name IN (${LEARNING_IN})) AS learn,
        count(DISTINCT device_id) FILTER (WHERE name IN (${LEARNING_IN})) AS learn_dev,
        count(*) FILTER (WHERE name = 'ime_restarted' AND coalesce(props->>'kind', 'crash') <> 'system') AS crashes,
        count(*) FILTER (WHERE name IN ('sentence_latency', 'polish_latency')) AS api_n,
        count(*) FILTER (WHERE name IN ('sentence_latency', 'polish_latency') AND NOT ${OK}) AS api_err
      FROM ev GROUP BY 1
    ),
    tdd AS (
      SELECT day, count(*) AS dd, sum(coalesce(mins, 0)) AS mins, sum(coalesce(chars, 0)) AS chars,
        sum(coalesce(en, 0)) AS en, count(*) FILTER (WHERE t_has) AS t_n, count(*) FILTER (WHERE t_off) AS t_off
      FROM td WHERE coalesce(commits, 0) >= 1 GROUP BY 1
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.day > ${TODAY} - ${R} AS cur,
      (SELECT count(*) FROM cohort c WHERE c.d0 = d.day)::int AS inst_new,
      (SELECT count(*) FROM cohort c WHERE c.d0 <= d.day)::int AS inst_cum,
      (SELECT count(*) FROM cohort c JOIN imp USING (device_id) WHERE c.d0 = d.day)::int AS imported,
      (SELECT count(*) FROM onb WHERE onb.day = d.day)::int AS onb_n,
      (SELECT count(*) FROM onb JOIN onb_done USING (device_id) WHERE onb.day = d.day)::int AS onb_done,
      (SELECT count(*) FROM a WHERE a.day = d.day)::int AS dau,
      (SELECT count(*) FROM a WHERE a.day = d.day AND a.fb)::int AS dau_fb,
      (SELECT count(DISTINCT device_id) FROM a WHERE a.day BETWEEN d.day - 6 AND d.day)::int AS wau,
      (SELECT count(*) FROM seen WHERE seen.day = d.day)::int AS seen,
      (SELECT count(*) FROM seen JOIN dp USING (device_id) WHERE seen.day = d.day AND dp.platform = 'mac')::int AS mac,
      (SELECT count(*) FROM vb WHERE vb.day = d.day AND vb.v IS NOT NULL)::int AS ver_n,
      (SELECT count(*) FROM vb JOIN lat USING (day, platform) WHERE vb.day = d.day AND vb.v = lat.latest)::int AS ver_latest,
      coalesce(tdd.dd, 0)::int AS dd, coalesce(tdd.mins, 0)::int AS mins, coalesce(tdd.chars, 0)::int AS chars,
      coalesce(tdd.en, 0)::int AS en, coalesce(tdd.t_n, 0)::int AS t_n, coalesce(tdd.t_off, 0)::int AS t_off,
      coalesce(evd.cards, 0)::int AS cards, coalesce(evd.learn, 0)::int AS learn, coalesce(evd.learn_dev, 0)::int AS learn_dev,
      coalesce(evd.crashes, 0)::int AS crashes, coalesce(evd.api_n, 0)::int AS api_n, coalesce(evd.api_err, 0)::int AS api_err,
      (SELECT count(*) FROM imprv WHERE imprv.day = d.day)::int AS imp_n,
      (SELECT count(*) FROM imprv WHERE imprv.day = d.day AND NOT imprv.improve_on)::int AS imp_off
    FROM d LEFT JOIN evd USING (day) LEFT JOIN tdd USING (day) ORDER BY d.day`);
  // Counts only; the dashboard never reads sample text.
  const sampleDays = await q<{ day: string; cur: boolean; zh_en: number; polish: number; survey: number }>(`
    WITH d AS (SELECT generate_series(${TODAY} - ${R2 - 1}, ${TODAY}, '1 day')::date AS day),
    s AS (
      SELECT ${BATCH_DAY} AS day, count(*) FILTER (WHERE kind = 'zh_en') AS zh_en, count(*) FILTER (WHERE kind = 'polish') AS polish,
        count(*) FILTER (WHERE kind = 'survey') AS survey
      FROM samples WHERE received_at >= now() - interval '${R2 + 1} days' ${scope} GROUP BY 1
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.day > ${TODAY} - ${R} AS cur,
      coalesce(s.zh_en, 0)::int AS zh_en, coalesce(s.polish, 0)::int AS polish, coalesce(s.survey, 0)::int AS survey
    FROM d LEFT JOIN s USING (day) ORDER BY d.day`);
  const [sampleTotals] = await q<{ stored: number; devices: number; deletions: number }>(`
    SELECT (SELECT count(*) FROM samples WHERE TRUE ${scope})::int AS stored,
      (SELECT count(DISTINCT device_id) FROM samples WHERE TRUE ${scope})::int AS devices,
      (SELECT count(*) FROM ${ALL} e WHERE name = 'improve_samples_deleted')::int AS deletions`);
  // Each device's newest version in the current range.
  const verDist = await q<{ platform: string; version: string; n: number; latest: boolean }>(`
    WITH v AS (
      SELECT DISTINCT ON (device_id) device_id, app_version, ${VKEY} AS k,
        coalesce(platform, CASE WHEN os_version ILIKE 'windows%' THEN 'windows' ELSE 'mac' END) AS platform
      FROM batches WHERE received_at >= now() - interval '${R} days' ${scope}
      ORDER BY device_id, received_at DESC
    )
    SELECT platform, app_version AS version, count(*)::int AS n,
      bool_and(k IS NOT NULL AND k = (SELECT max(k) FROM v v2 WHERE v2.platform = v.platform)) AS latest
    FROM v GROUP BY 1, 2 ORDER BY n DESC`);

  // ---------- 1 真需求 ----------
  const activeCond = f.strict ? `coalesce(d.chars, 0) >= 20` : `coalesce(d.commits, 0) >= 1`;
  const COHORT = f.cohort === "day" ? "c.d0" : "date_trunc('week', c.d0)";
  const RET_CTE = `
    ev AS ${ALL},
    inst AS (
      SELECT device_id, min(d) AS d0 FROM (
        SELECT device_id, install_date AS d FROM batches WHERE install_date IS NOT NULL
        UNION ALL
        SELECT device_id, ${DAY} FROM ev WHERE name IN ('install', 'input_source_added')
      ) x GROUP BY device_id
    ),
    cohort AS (
      SELECT device_id, d0 FROM inst
      WHERE device_id IN (SELECT device_id FROM ev WHERE name = 'input_source_added')
    ),
    daily AS (
      SELECT device_id, (props->>'day')::date AS day,
        max((props->>'commits')::int) AS commits, max((props->>'chars')::int) AS chars,
        max((props->>'away_30m')::int) AS away
      FROM ev WHERE name = 'input_time_daily' AND props ? 'day' GROUP BY 1, 2
    ),`;
  const retention = await q<{ week: string | null; k: number; den: number; active: number; main: number }>(`
    WITH ${RET_CTE}
    w(k, lo, hi) AS (VALUES (1, 1, 1), (3, 3, 4), (7, 7, 9), (14, 14, 16))
    SELECT to_char(${COHORT}, 'YYYY-MM-DD') AS week, w.k,
      count(*)::int AS den,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily d WHERE d.device_id = c.device_id
        AND d.day - c.d0 BETWEEN w.lo AND w.hi AND ${activeCond}))::int AS active,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily d WHERE d.device_id = c.device_id
        AND d.day - c.d0 BETWEEN w.lo AND w.hi AND coalesce(d.chars, 0) >= 200 AND coalesce(d.away, 0) <= 1))::int AS main
    FROM cohort c CROSS JOIN w
    WHERE ${TODAY} - c.d0 > w.hi
    GROUP BY GROUPING SETS ((${COHORT}, w.k), (w.k))
    ORDER BY week DESC NULLS FIRST, w.k`);

  // Day cohorts over the range. `done`: the window has closed (its last day is over).
  // Install cohort: installed on that day, active anywhere in the window (as above).
  // Per device-day: input_time_daily decides when that day has one, else any report counts.
  const ACT = `act AS (
    SELECT device_id, day FROM daily d WHERE ${activeCond}
    UNION
    SELECT s.device_id, s.day FROM (SELECT DISTINCT device_id, ${DAY} AS day FROM ev) s
      LEFT JOIN daily d USING (device_id, day) WHERE d.commits IS NULL AND d.chars IS NULL
  ),`;
  const installDaily = await q<{ day: string; k: number; done: boolean; den: number; active: number; main: number }>(`
    WITH ${RET_CTE}
    ${ACT}
    w(k, lo, hi) AS (VALUES (1, 1, 1), (3, 3, 4), (7, 7, 9), (14, 14, 16)),
    dd AS (SELECT generate_series(${TODAY} - ${R - 1}, ${TODAY}, '1 day')::date AS day)
    SELECT to_char(dd.day, 'YYYY-MM-DD') AS day, w.k, ${TODAY} - dd.day > w.hi AS done,
      count(c.device_id)::int AS den,
      count(c.device_id) FILTER (WHERE EXISTS (SELECT 1 FROM act a WHERE a.device_id = c.device_id
        AND a.day - c.d0 BETWEEN w.lo AND w.hi))::int AS active,
      count(c.device_id) FILTER (WHERE EXISTS (SELECT 1 FROM daily d WHERE d.device_id = c.device_id
        AND d.day - c.d0 BETWEEN w.lo AND w.hi AND coalesce(d.chars, 0) >= 200 AND coalesce(d.away, 0) <= 1))::int AS main
    FROM dd CROSS JOIN w LEFT JOIN cohort c ON c.d0 = dd.day
    GROUP BY dd.day, w.k, w.hi ORDER BY dd.day, w.k`);
  // Active cohort: active on that day, active again exactly k days later.
  const activeDaily = await q<{ day: string; k: number; done: boolean; den: number; ret: number }>(`
    WITH ${RET_CTE}
    ${ACT}
    w(k) AS (VALUES (1), (3), (7)),
    dd AS (SELECT generate_series(${TODAY} - ${R - 1}, ${TODAY}, '1 day')::date AS day)
    SELECT to_char(dd.day, 'YYYY-MM-DD') AS day, w.k, ${TODAY} - dd.day > w.k AS done,
      count(a.device_id)::int AS den,
      count(a.device_id) FILTER (WHERE EXISTS (SELECT 1 FROM act b WHERE b.device_id = a.device_id AND b.day = a.day + w.k))::int AS ret
    FROM dd CROSS JOIN w LEFT JOIN act a ON a.day = dd.day
    GROUP BY dd.day, w.k ORDER BY dd.day, w.k`);

  const activeTrend = await q<{ label: string; active: number; main: number }>(`
    WITH d AS (SELECT generate_series(${TODAY} - ${R - 1}, ${TODAY}, '1 day')::date AS day),
    daily AS (
      SELECT device_id, (props->>'day')::date AS day,
        max((props->>'commits')::int) AS commits, max((props->>'chars')::int) AS chars,
        max((props->>'away_30m')::int) AS away
      FROM ${EV(R + 2)} e WHERE name = 'input_time_daily' AND props ? 'day' AND (props->>'day')::date > ${TODAY} - ${R}
      GROUP BY 1, 2
    )
    SELECT to_char(d.day, 'MM-DD') AS label,
      count(DISTINCT x.device_id) FILTER (WHERE ${dailyCond})::int AS active,
      count(DISTINCT x.device_id) FILTER (WHERE coalesce(chars, 0) >= 200 AND coalesce(away, 0) <= 1)::int AS main
    FROM d LEFT JOIN daily x USING (day) GROUP BY d.day ORDER BY d.day`);

  const cohortRows = await q<{ label: string; n: number }>(`
    WITH ev AS ${ALL},
    inst AS (
      SELECT device_id, min(d) AS d0 FROM (
        SELECT device_id, install_date AS d FROM batches WHERE install_date IS NOT NULL
        UNION ALL
        SELECT device_id, ${DAY} FROM ev WHERE name IN ('install', 'input_source_added')
      ) x GROUP BY device_id
    ),
    cohort AS (
      SELECT device_id, d0 FROM inst
      WHERE device_id IN (SELECT device_id FROM ev WHERE name = 'input_source_added')
    )
    SELECT to_char(${COHORT}, 'YYYY-MM-DD') AS label, count(*)::int AS n
    FROM cohort c WHERE c.d0 > ${TODAY} - 120 GROUP BY 1 ORDER BY 1 DESC`);

  const [cohorts] = await q<{ n: number }>(`
    SELECT count(DISTINCT device_id)::int AS n FROM ${ALL} e WHERE name = 'input_source_added'`);

  const DAILY14 = `
    daily AS (
      SELECT device_id, (props->>'day')::date AS day,
        max((props->>'commits')::int) AS commits, max((props->>'chars')::int) AS chars,
        max((props->>'chars_en_typed')::int) AS en, max((props->>'chars_en_card')::int) AS en_card,
        max((props->>'away_30m')::int) AS away, max((props->>'youdao_typing_min')::int) AS mins,
        max((props->>'zh_only_typing_min')::int) AS zh_mins,
        max((props->>'switch_away')::int) AS sw_away, max((props->>'switch_back')::int) AS sw_back,
        max((props->>'typing_min_chat')::int) AS m_chat, max((props->>'typing_min_mail')::int) AS m_mail,
        max((props->>'typing_min_doc')::int) AS m_doc, max((props->>'typing_min_code')::int) AS m_code,
        max((props->>'typing_min_other')::int) AS m_other
      FROM ${EV(R + 7)} e WHERE name = 'input_time_daily' AND props ? 'day'
        AND (props->>'day')::date > ${TODAY} - ${R}
      GROUP BY 1, 2
    )`;

  const [daily] = await q<{
    device_days: number; chars_p50: number | null; mins_p50: number | null; en_ratio_p50: number | null;
    en_typed: number; en_card: number; chars: number; sw_away_p50: number | null; sw_back_p50: number | null;
    zh_mins: number; mins: number; m_chat: number; m_mail: number; m_doc: number; m_code: number; m_other: number;
  }>(`
    WITH ${DAILY14}
    SELECT count(*) FILTER (WHERE commits >= 1)::int AS device_days,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY chars) FILTER (WHERE commits >= 1) AS chars_p50,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY mins) FILTER (WHERE commits >= 1) AS mins_p50,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY en::float / nullif(chars, 0)) FILTER (WHERE chars > 0 AND en IS NOT NULL) AS en_ratio_p50,
      coalesce(sum(en), 0)::int AS en_typed, coalesce(sum(en_card), 0)::int AS en_card, coalesce(sum(chars), 0)::int AS chars,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY sw_away) FILTER (WHERE commits >= 1) AS sw_away_p50,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY sw_back) FILTER (WHERE commits >= 1) AS sw_back_p50,
      coalesce(sum(zh_mins), 0)::int AS zh_mins, coalesce(sum(mins), 0)::int AS mins,
      coalesce(sum(m_chat), 0)::int AS m_chat, coalesce(sum(m_mail), 0)::int AS m_mail,
      coalesce(sum(m_doc), 0)::int AS m_doc, coalesce(sum(m_code), 0)::int AS m_code,
      coalesce(sum(m_other), 0)::int AS m_other
    FROM daily`);

  const charsDist = await q<Count>(`
    WITH ${DAILY14}
    SELECT b AS label, count(*)::int AS n FROM (
      SELECT CASE WHEN chars < 20 THEN '1–19' WHEN chars < 200 THEN '20–199' WHEN chars < 500 THEN '200–499'
        WHEN chars < 1000 THEN '500–999' ELSE '1000+' END AS b, chars FROM daily WHERE commits >= 1) x
    GROUP BY b ORDER BY min(chars)`);
  const awayDist = await q<Count>(`
    WITH ${DAILY14}
    SELECT b AS label, count(*)::int AS n FROM (
      SELECT CASE WHEN away >= 3 THEN '3+' ELSE away::text END AS b, away FROM daily
      WHERE commits >= 1 AND away IS NOT NULL) x
    GROUP BY b ORDER BY min(away)`);

  const [enDominant] = await q<{ num: number; den: number }>(`
    WITH d AS (
      SELECT device_id, (props->>'day')::date AS day, max((props->>'commits')::int) AS commits,
        max((props->>'chars')::int) AS chars, max((props->>'chars_en_typed')::int) AS en
      FROM ${EV(R + 3)} e WHERE name = 'input_time_daily' AND props ? 'day' AND (props->>'day')::date > ${TODAY} - ${R}
      GROUP BY 1, 2
    ), dev AS (
      SELECT device_id, sum(chars) AS chars, sum(coalesce(en, 0)) AS en FROM d WHERE commits >= 1 GROUP BY 1
    )
    SELECT count(*) FILTER (WHERE chars > 0 AND en::float / nullif(chars, 0) >= 0.5)::int AS num, count(*)::int AS den FROM dev`);

  const enByApp = await q<{ label: string; p50: number | null; n: number }>(`
    WITH t AS (
      SELECT device_id, ${DAY} AS day, coalesce(props->>'app_category', 'other') AS cat,
        sum(coalesce((props->>'chars')::int, 0)) AS zh, sum(coalesce((props->>'en_chars')::int, 0)) AS en
      FROM ${EV(R)} e WHERE name = 'typing_stats' GROUP BY 1, 2, 3
    )
    SELECT cat AS label, percentile_cont(0.5) WITHIN GROUP (ORDER BY en::float / nullif(zh + en, 0)) AS p50, count(*)::int AS n
    FROM t WHERE zh + en > 0 GROUP BY cat ORDER BY cat`);

  const [awayTime] = await q<{ n: number; p50: number | null; p90: number | null }>(`
    SELECT count(*)::int AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'away_s')::int) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY (props->>'away_s')::int) AS p90
    FROM ${EV(R)} e WHERE name = 'ime_activated' AND props ? 'away_s'`);
  const toKinds = await q<Count>(`
    SELECT coalesce(props->>'to_kind', '?') AS label, count(*)::int AS n
    FROM ${EV(R)} e WHERE name = 'ime_deactivated' GROUP BY 1 ORDER BY n DESC`);

  const [activeEnglish] = await q<{ n: number; days: number }>(`
    SELECT
      (SELECT count(*) FROM ${EV(R)} e WHERE name = 'card_shown' AND props->>'trigger' IN ('ctrl_j', 'click'))::int AS n,
      (SELECT count(DISTINCT (device_id, props->>'day')) FROM ${EV(R + 2)} e WHERE name = 'input_time_daily'
        AND props ? 'day' AND (props->>'day')::date > ${TODAY} - ${R} AND (props->>'commits')::int >= 1)::int AS days`);

  const [survey] = await q<{ shown: number; answered: number; very: number }>(`
    SELECT count(DISTINCT device_id) FILTER (WHERE name = 'survey_shown')::int AS shown,
      count(DISTINCT device_id) FILTER (WHERE name = 'survey_answered')::int AS answered,
      count(DISTINCT device_id) FILTER (WHERE name = 'survey_answered' AND props->>'answer' = 'very')::int AS very
    FROM ${ALL} e WHERE name IN ('survey_shown', 'survey_answered')`);

  // ---------- 2 只打中文 ----------
  const TYPING = (days: number) => `
    t AS (
      SELECT device_id, ${DAY} AS day,
        sum(coalesce((props->>'commits')::int, 0)) AS commits, sum(coalesce((props->>'first_hit')::int, 0)) AS hit,
        sum(coalesce((props->>'keys')::int, 0)) AS keys, sum(coalesce((props->>'chars')::int, 0)) AS chars,
        sum(coalesce((props->>'abandoned')::int, 0)) AS abandoned, sum(coalesce((props->>'paged')::int, 0)) AS paged,
        sum(coalesce((props->>'expanded')::int, 0)) AS expanded
      FROM ${EV(days)} e WHERE name = 'typing_stats' GROUP BY 1, 2
    )`;
  const MEDIANS = `
    percentile_cont(0.5) WITHIN GROUP (ORDER BY hit::float / nullif(commits, 0)) FILTER (WHERE commits > 0) AS hit,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY keys::float / nullif(chars, 0)) FILTER (WHERE chars > 0) AS kpc,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abandoned::float / nullif(commits + abandoned, 0)) FILTER (WHERE commits + abandoned > 0) AS abandon,
    count(*) FILTER (WHERE commits > 0)::int AS n`;
  type Typing = { hit: number | null; kpc: number | null; abandon: number | null; n: number };
  const [typing] = await q<Typing & { paged: number; expanded: number; commits: number }>(`
    WITH ${TYPING(R)}
    SELECT ${MEDIANS}, coalesce(sum(paged), 0)::int AS paged, coalesce(sum(expanded), 0)::int AS expanded,
      coalesce(sum(commits), 0)::int AS commits FROM t`);
  const typingByDay = await q<Typing & { label: string }>(`
    WITH ${TYPING(R)}
    SELECT to_char(day, 'MM-DD') AS label, ${MEDIANS} FROM t GROUP BY day ORDER BY day DESC`);
  const hitSeries = await q<Typing & { day: string }>(`
    WITH ${TYPING(R2 + 1)}
    SELECT to_char(day, 'YYYY-MM-DD') AS day, ${MEDIANS} FROM t WHERE day > ${TODAY} - ${R2} GROUP BY t.day ORDER BY t.day`);
  const typingByPlatform = await q<Typing & { label: string }>(`
    WITH ${TYPING(R)}, dp AS (${DEVICE_PLATFORM})
    SELECT dp.platform AS label, ${MEDIANS} FROM t JOIN dp USING (device_id) GROUP BY 1 ORDER BY 1`);
  const typingByApp = await q<Typing & { label: string }>(`
    WITH t AS (
      SELECT device_id, ${DAY} AS day, coalesce(props->>'app_category', 'other') AS cat,
        sum(coalesce((props->>'commits')::int, 0)) AS commits, sum(coalesce((props->>'first_hit')::int, 0)) AS hit,
        sum(coalesce((props->>'keys')::int, 0)) AS keys, sum(coalesce((props->>'chars')::int, 0)) AS chars,
        sum(coalesce((props->>'abandoned')::int, 0)) AS abandoned
      FROM ${EV(R)} e WHERE name = 'typing_stats' GROUP BY 1, 2, 3
    )
    SELECT cat AS label, ${MEDIANS} FROM t GROUP BY cat ORDER BY cat`);
  const typingBySinceInstall = await q<Typing & { label: string }>(`
    WITH ${TYPING(30)}, inst AS (
      SELECT device_id, min(d) AS d0 FROM (
        SELECT device_id, install_date AS d FROM batches WHERE install_date IS NOT NULL
        UNION ALL SELECT device_id, ${DAY} FROM events WHERE name IN ('install', 'input_source_added')
      ) x GROUP BY device_id
    )
    SELECT CASE WHEN day - d0 <= 0 THEN '第 0 天' WHEN day - d0 = 1 THEN '第 1 天' WHEN day - d0 <= 3 THEN '第 2–3 天'
      WHEN day - d0 <= 7 THEN '第 4–7 天' WHEN day - d0 <= 14 THEN '第 8–14 天' ELSE '第 15 天以后' END AS label,
      ${MEDIANS}
    FROM t JOIN inst USING (device_id) GROUP BY 1 ORDER BY min(day - d0)`);
  const typingByImport = await q<Typing & { label: string }>(`
    WITH ${TYPING(R)}, imp AS (
      SELECT DISTINCT device_id FROM events WHERE name = 'dict_import' AND coalesce((props->>'added')::int, 0) > 0
    )
    SELECT CASE WHEN imp.device_id IS NULL THEN '没导入词库' ELSE '导入过词库' END AS label, ${MEDIANS}
    FROM t LEFT JOIN imp USING (device_id) GROUP BY 1 ORDER BY 1`);

  const [struggle] = await q<{ total: number; struggle: number; devices: number }>(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE (props->>'struggle')::boolean)::int AS struggle,
      count(DISTINCT device_id) FILTER (WHERE (props->>'struggle')::boolean)::int AS devices
    FROM ${EV(R)} e WHERE name = 'ime_deactivated'`);

  const [dictImport] = await q<{ num: number; den: number }>(`
    SELECT count(DISTINCT device_id) FILTER (WHERE name = 'dict_import' AND coalesce((props->>'added')::int, 0) > 0)::int AS num,
      count(DISTINCT device_id) FILTER (WHERE name = 'input_source_added')::int AS den
    FROM ${ALL} e WHERE name IN ('dict_import', 'input_source_added')`);
  const dictSources = await q<Count>(`
    SELECT coalesce(props->>'dict_source', '?') AS label, count(DISTINCT device_id)::int AS n
    FROM ${ALL} e WHERE name = 'dict_import' GROUP BY 1 ORDER BY n DESC`);
  const userWords = await q<Count>(`
    SELECT coalesce(props->>'entry', '?') AS label, count(*)::int AS n
    FROM ${EV(R)} e WHERE name = 'user_word_added' GROUP BY 1 ORDER BY n DESC`);
  const candidates = await q<Count>(`
    SELECT CASE WHEN (props->>'index')::int >= 9 THEN '9+' ELSE props->>'index' END AS label, count(*)::int AS n
    FROM ${EV(R)} e WHERE name = 'candidate_index_chosen' AND props ? 'index'
    GROUP BY 1 ORDER BY min((props->>'index')::int)`);

  // ---------- 3 翻译准不准 ----------
  // Every card event counts on the day its card was shown (see SHOWN_DAY).
  const CARDS = `
    raw AS (
      SELECT ${DAY} AS day, name, coalesce(props->>'card_id', 'e' || id) AS cid, props ? 'card_id' AS has_id, props
      FROM ${EV(R + 1)} e WHERE name IN ('card_shown', 'card_replaced', 'card_glanced', 'card_undo_after_replace',
        'card_edited_after_replace', 'tone_switched', 'card_feedback')
    ),
    ${SHOWN_DAY("card_shown")},
    x AS (SELECT name, cid, props, sp FROM att WHERE day > ${TODAY} - ${R})`;
  type Adopt = { label: string; shown: number; adopted: number; glanced: number; useful: number; undone: number };
  const ADOPT = `
    count(DISTINCT cid) FILTER (WHERE name = 'card_shown')::int AS shown,
    count(DISTINCT cid) FILTER (WHERE name = 'card_replaced' AND ${OK})::int AS adopted,
    count(DISTINCT cid) FILTER (WHERE name = 'card_glanced')::int AS glanced,
    count(DISTINCT cid) FILTER (WHERE (name = 'card_replaced' AND ${OK}) OR name = 'card_glanced')::int AS useful,
    count(DISTINCT cid) FILTER (WHERE name = 'card_undo_after_replace')::int AS undone`;
  const adoptBy = (dim: string) => q<Adopt>(`
    WITH ${CARDS}
    SELECT coalesce(sp->>'${dim}', props->>'${dim}', '?') AS label, ${ADOPT} FROM x
    WHERE name IN ('card_shown', 'card_replaced', 'card_glanced', 'card_undo_after_replace')
    GROUP BY 1 ORDER BY shown DESC`);
  const [adoption] = await q<Adopt & { edited: number; toneSwitched: number; up: number; down: number }>(`
    WITH ${CARDS}
    SELECT 'all' AS label, ${ADOPT},
      count(DISTINCT cid) FILTER (WHERE name = 'card_edited_after_replace')::int AS edited,
      count(DISTINCT cid) FILTER (WHERE name = 'tone_switched' AND props ? 'card_id')::int AS "toneSwitched",
      count(*) FILTER (WHERE name = 'card_feedback' AND props->>'vote' = 'up')::int AS up,
      count(*) FILTER (WHERE name = 'card_feedback' AND props->>'vote' = 'down')::int AS down
    FROM x`);
  const adoptByTone = await adoptBy("tone");
  const adoptByApp = await adoptBy("app_category");
  const adoptByLen = await adoptBy("len_bucket");

  // One row per card shown in the range. Turn-offs and switching away carry the
  // card in card_id or recent_card_id; of the interruptions, the first one wins
  // (same rule as 打扰率).
  const PER_CARD = `
    c AS (
      SELECT coalesce(props->>'card_id', props->>'recent_card_id') AS cid,
        min(${DAY}) FILTER (WHERE name = 'card_shown') AS day,
        bool_or(name = 'card_shown') AS shown,
        bool_or(name = 'card_replaced' AND ${OK}) AS adopted,
        bool_or(name = 'card_undo_after_replace') AS undone,
        bool_or(name = 'card_edited_after_replace') AS edited,
        bool_or(name = 'card_glanced') AS glanced,
        (array_agg(CASE WHEN name = 'card_dismissed' THEN 'esc' WHEN name = 'ime_deactivated' THEN 'away' ELSE 'closed' END
          ORDER BY ts) FILTER (WHERE name IN ('card_dismissed', 'card_closed', 'translation_turned_off', 'ime_deactivated')
            OR (name = 'translation_toggled' AND (props->>'on')::boolean = false)))[1] AS disrupt,
        bool_or(name = 'sentence_latency' AND NOT ${OK}) AS failed,
        bool_or(name = 'card_feedback' AND props->>'vote' = 'down') AS down
      FROM ${EV(R + 1)} e WHERE (props ? 'card_id' OR props ? 'recent_card_id') AND name IN ('card_shown', 'card_replaced',
        'card_undo_after_replace', 'card_edited_after_replace', 'card_glanced', 'card_dismissed', 'card_closed',
        'translation_turned_off', 'translation_toggled', 'ime_deactivated', 'sentence_latency', 'card_feedback')
      GROUP BY 1
    )`;
  const outcomes = await q<Count>(`
    WITH ${PER_CARD}
    SELECT CASE WHEN undone THEN 'undone' WHEN edited THEN 'edited' WHEN adopted THEN 'adopted'
      WHEN failed THEN 'failed' WHEN disrupt IS NOT NULL THEN disrupt WHEN glanced THEN 'glanced'
      ELSE 'none' END AS label, count(*)::int AS n
    FROM c WHERE shown AND day > ${TODAY} - ${R} GROUP BY 1`);
  const [downAdopted] = await q<{ down: number; adopted: number }>(`
    WITH ${PER_CARD}
    SELECT count(*) FILTER (WHERE down)::int AS down, count(*) FILTER (WHERE down AND adopted)::int AS adopted
    FROM c WHERE shown AND day > ${TODAY} - ${R}`);
  const downReasons = await q<Count>(`
    SELECT coalesce(props->>'reason', '未选') AS label, count(*)::int AS n FROM ${EV(R)} e
    WHERE name = 'card_feedback' AND props->>'vote' = 'down' GROUP BY 1 ORDER BY n DESC`);

  const [latency] = await q<{ n: number; errors: number; p50: number | null; p90: number | null }>(`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT ${OK})::int AS errors,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE ${OK}))::int AS p50,
      round(percentile_cont(0.9) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE ${OK}))::int AS p90
    FROM ${EV(R)} e WHERE name = 'sentence_latency' AND props ? 'ms'`);
  const latencyByDay = await q<{ label: string; n: number; errors: number; p50: number | null; p90: number | null }>(`
    SELECT to_char(${DAY}, 'MM-DD') AS label, count(*)::int AS n, count(*) FILTER (WHERE NOT ${OK})::int AS errors,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE ${OK}))::int AS p50,
      round(percentile_cont(0.9) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE ${OK}))::int AS p90
    FROM ${EV(R)} e WHERE name = 'sentence_latency' AND props ? 'ms' GROUP BY ${DAY} ORDER BY ${DAY} DESC`);
  const errorCodes = await q<Count>(`
    SELECT coalesce(props->>'error_code', '?') AS label, count(*)::int AS n FROM ${EV(R)} e
    WHERE name = 'sentence_latency' AND NOT ${OK} GROUP BY 1 ORDER BY n DESC LIMIT 10`);

  type Polish = { dim: string; label: string; shown: number; accepted: number; glanced: number; closed: number;
    esc: number; undone: number; up: number; down: number };
  const polish = await q<Polish>(`
    WITH c AS (
      SELECT coalesce(props->>'card_id', props->>'recent_card_id') AS cid,
        min(${DAY}) FILTER (WHERE name = 'polish_shown') AS day,
        max(props->>'app_category') FILTER (WHERE name = 'polish_shown') AS cat,
        max(props->>'len_bucket') FILTER (WHERE name = 'polish_shown') AS len,
        bool_or(name = 'polish_shown') AS shown,
        bool_or(name = 'polish_accepted' AND ${OK}) AS accepted,
        bool_or(name = 'polish_glanced') AS glanced,
        bool_or(name = 'polish_closed' OR (name = 'translation_turned_off' AND props->>'feature' = 'polish')) AS closed,
        bool_or(name = 'polish_dismissed') AS esc,
        bool_or(name = 'polish_undo_after_accept') AS undone,
        bool_or(name = 'polish_feedback' AND props->>'vote' = 'up') AS up,
        bool_or(name = 'polish_feedback' AND props->>'vote' = 'down') AS down
      FROM ${EV(R + 1)} e WHERE (name LIKE 'polish\\_%' OR (name = 'translation_turned_off' AND props->>'feature' = 'polish'))
        AND (props ? 'card_id' OR props ? 'recent_card_id') GROUP BY 1
    )
    SELECT CASE WHEN GROUPING(cat) = 0 THEN 'app' WHEN GROUPING(len) = 0 THEN 'len' ELSE 'all' END AS dim,
      coalesce(CASE WHEN GROUPING(cat) = 0 THEN cat ELSE len END, '?') AS label,
      count(*)::int AS shown, count(*) FILTER (WHERE accepted)::int AS accepted,
      count(*) FILTER (WHERE glanced)::int AS glanced, count(*) FILTER (WHERE closed)::int AS closed,
      count(*) FILTER (WHERE esc)::int AS esc, count(*) FILTER (WHERE undone)::int AS undone,
      count(*) FILTER (WHERE up)::int AS up, count(*) FILTER (WHERE down)::int AS down
    FROM c WHERE shown AND day > ${TODAY} - ${R} GROUP BY GROUPING SETS ((cat), (len), ())`);
  const [polishLatency] = await q<{ n: number; errors: number; p50: number | null; p90: number | null }>(`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT ${OK})::int AS errors,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE ${OK}))::int AS p50,
      round(percentile_cont(0.9) WITHIN GROUP (ORDER BY (props->>'ms')::int) FILTER (WHERE ${OK}))::int AS p90
    FROM ${EV(R)} e WHERE name = 'polish_latency' AND props ? 'ms'`);

  // ---------- 4 打扰 ----------
  // Each card counts once, under whichever of the four happened first.
  // Interrupt = turned off (X, shortcut, Settings) + Esc + switched away.
  // Each card counts once, under whichever happened first. The deprecated
  // card_closed / polish_closed count as X; translation_toggled off as Settings.
  const DISRUPT_W = (days: number) => `
    s AS (
      SELECT props->>'card_id' AS cid, min(${DAY}) AS day,
        CASE WHEN name = 'card_shown' THEN 'translate' ELSE 'polish' END AS type,
        coalesce(max(props->>'trigger'), '?') AS trig
      FROM ${EV(days)} e WHERE name IN ('card_shown', 'polish_shown') AND props ? 'card_id' GROUP BY 1, 3
    ),
    d AS (
      SELECT coalesce(props->>'card_id', props->>'recent_card_id') AS cid, ts,
        CASE WHEN name = 'translation_turned_off' THEN coalesce(props->>'source', 'settings')
             WHEN name IN ('card_closed', 'polish_closed') THEN 'x_button'
             WHEN name = 'translation_toggled' THEN 'settings'
             WHEN name IN ('card_dismissed', 'polish_dismissed') THEN 'esc'
             ELSE 'away' END AS kind
      FROM ${EV(days)} e
      WHERE (name IN ('card_closed', 'polish_closed', 'card_dismissed', 'polish_dismissed') AND props ? 'card_id')
         OR (name = 'translation_turned_off' AND (props ? 'card_id' OR props ? 'recent_card_id'))
         OR (name = 'translation_toggled' AND (props->>'on')::boolean = false AND props ? 'recent_card_id')
         OR (name = 'ime_deactivated' AND props ? 'recent_card_id')
    ),
    fst AS (SELECT DISTINCT ON (cid) cid, kind FROM d ORDER BY cid, ts)`;
  const DISRUPT_COLS = `count(*)::int AS shown,
    count(*) FILTER (WHERE f.kind = 'x_button')::int AS off_x,
    count(*) FILTER (WHERE f.kind = 'shortcut')::int AS off_shortcut,
    count(*) FILTER (WHERE f.kind = 'settings')::int AS off_settings,
    count(*) FILTER (WHERE f.kind = 'esc')::int AS esc, count(*) FILTER (WHERE f.kind = 'away')::int AS away`;
  type Disrupt = { shown: number; off_x: number; off_shortcut: number; off_settings: number; esc: number; away: number };
  const disrupt = await q<Disrupt & { type: string | null; trig: string | null }>(`
    WITH ${DISRUPT_W(R + 1)}
    SELECT s.type, s.trig, ${DISRUPT_COLS}
    FROM s LEFT JOIN fst f USING (cid) WHERE s.day > ${TODAY} - ${R}
    GROUP BY GROUPING SETS ((s.type, s.trig), (s.type), ()) ORDER BY s.type NULLS FIRST, s.trig NULLS FIRST`);
  const disruptByDay = await q<Disrupt & { label: string }>(`
    WITH ${DISRUPT_W(R + 1)}
    SELECT to_char(s.day, 'MM-DD') AS label, ${DISRUPT_COLS}
    FROM s LEFT JOIN fst f USING (cid) WHERE s.day > ${TODAY} - ${R} GROUP BY s.day ORDER BY s.day DESC`);
  // type null = 中译英 and 润色 together.
  const disruptSeries = await q<Disrupt & { day: string; cur: boolean; type: string | null }>(`
    WITH ${DISRUPT_W(R2 + 1)}
    SELECT to_char(s.day, 'YYYY-MM-DD') AS day, s.day > ${TODAY} - ${R} AS cur, s.type, ${DISRUPT_COLS}
    FROM s LEFT JOIN fst f USING (cid) WHERE s.day > ${TODAY} - ${R2}
    GROUP BY GROUPING SETS ((s.day, s.type), (s.day)) ORDER BY s.day`);
  const [legacyEsc] = await q<{ shown: number; esc: number }>(`
    SELECT count(*) FILTER (WHERE name = 'card_shown')::int AS shown,
      count(*) FILTER (WHERE name = 'card_dismissed')::int AS esc
    FROM ${EV(R)} e WHERE name IN ('card_shown', 'card_dismissed')`);

  const [xPerDevice] = await q<{ devices: number; p50: number | null; p90: number | null; annoyed: number }>(`
    WITH per AS (
      SELECT device_id,
        count(DISTINCT props->>'card_id') FILTER (WHERE name IN ('card_shown', 'polish_shown')) AS shown,
        count(DISTINCT props->>'card_id') FILTER (WHERE name IN ('card_closed', 'polish_closed')
          OR (name = 'translation_turned_off' AND props->>'source' = 'x_button')) AS closed
      FROM ${EV(R)} e WHERE props ? 'card_id'
        AND name IN ('card_shown', 'polish_shown', 'card_closed', 'polish_closed', 'translation_turned_off')
      GROUP BY 1
    )
    SELECT count(*)::int AS devices,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY closed::float / shown) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY closed::float / shown) AS p90,
      count(*) FILTER (WHERE closed::float / shown >= 0.3)::int AS annoyed
    FROM per WHERE shown >= 10`);

  const keyLatency = await q<{ label: string; n: number; p50: number | null; p90: number | null; p99: number | null }>(`
    SELECT to_char(${DAY}, 'MM-DD') AS label, sum((props->>'count')::int)::int AS n,
      round(sum((props->>'p50_us')::bigint * (props->>'count')::int) / nullif(sum((props->>'count')::int), 0))::int AS p50,
      round(sum((props->>'p90_us')::bigint * (props->>'count')::int) / nullif(sum((props->>'count')::int), 0))::int AS p90,
      round(sum((props->>'p99_us')::bigint * (props->>'count')::int) / nullif(sum((props->>'count')::int), 0))::int AS p99
    FROM ${EV(R)} e WHERE name = 'key_latency' AND props ? 'count' AND props ? 'p50_us' AND props ? 'p90_us' AND props ? 'p99_us'
    GROUP BY ${DAY} ORDER BY ${DAY} DESC`);

  // Turn-offs and turn-ons, with the deprecated translation_toggled folded in.
  const SWITCHES = `
    offs AS (
      SELECT device_id, coalesce(props->>'feature', 'translate') AS feature,
        coalesce(props->>'source', 'settings') AS source, ts
      FROM ${ALL} e WHERE name = 'translation_turned_off'
      UNION ALL
      SELECT device_id, coalesce(props->>'feature', 'translate'), 'settings', ts
      FROM ${ALL} e WHERE name = 'translation_toggled' AND (props->>'on')::boolean = false
    ),
    ons AS (
      SELECT device_id, coalesce(props->>'feature', 'translate') AS feature, ts
      FROM ${ALL} e WHERE name = 'translation_turned_on'
         OR (name = 'translation_toggled' AND (props->>'on')::boolean = true)
    )`;
  const reopen = await q<{ label: string | null; offs: number; reopened: number; p50: number | null; p90: number | null }>(`
    WITH ${SWITCHES},
    paired AS (
      SELECT o.source, o.ts,
        (SELECT min(n.ts) FROM ons n WHERE n.device_id = o.device_id AND n.feature = o.feature AND n.ts > o.ts) AS on_ts
      FROM offs o WHERE o.ts >= now() - interval '30 days'
    )
    SELECT source AS label, count(*)::int AS offs, count(on_ts)::int AS reopened,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM on_ts - ts) / 60) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM on_ts - ts) / 60) AS p90
    FROM paired GROUP BY GROUPING SETS ((source), ()) ORDER BY source NULLS FIRST`);
  // Denominator: first turn-off at least 7 days ago, and active on a later day.
  const neverReopened = await q<{ feature: string | null; source: string | null; num: number; den: number }>(`
    WITH ${SWITCHES},
    fst AS (SELECT DISTINCT ON (device_id, feature) device_id, feature, source, ts FROM offs ORDER BY device_id, feature, ts),
    act AS (
      SELECT DISTINCT device_id, (props->>'day')::date AS day FROM ${ALL} e
      WHERE name = 'input_time_daily' AND props ? 'day' AND coalesce((props->>'commits')::int, 0) >= 1
    )
    SELECT f.feature, f.source,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ons n
        WHERE n.device_id = f.device_id AND n.feature = f.feature AND n.ts > f.ts))::int AS num,
      count(*)::int AS den
    FROM fst f
    WHERE f.ts <= now() - interval '7 days'
      AND EXISTS (SELECT 1 FROM act a WHERE a.device_id = f.device_id AND a.day > (f.ts AT TIME ZONE 'Asia/Shanghai')::date)
    GROUP BY GROUPING SETS ((f.feature, f.source), ()) ORDER BY f.feature NULLS FIRST, f.source`);
  // 每周关闭设备占比: of the devices that showed a card that week, the share that
  // turned it off at least once that week (any source, with or without a card).
  // feature 'all' = either card type.
  const weeklyOff = await q<{ label: string; current: boolean; feature: string; den: number; num: number;
    x: number; shortcut: number; settings: number }>(`
    WITH ev AS ${EV(70)},
    shown AS (
      SELECT DISTINCT device_id, date_trunc('week', ${DAY})::date AS w,
        CASE WHEN name = 'card_shown' THEN 'translate' ELSE 'polish' END AS feature
      FROM ev WHERE name IN ('card_shown', 'polish_shown')
    ),
    offs AS (
      SELECT device_id, date_trunc('week', ${DAY})::date AS w,
        CASE WHEN name = 'polish_closed' THEN 'polish' ELSE coalesce(props->>'feature', 'translate') END AS feature,
        CASE WHEN name = 'translation_turned_off' THEN coalesce(props->>'source', 'settings')
             WHEN name IN ('card_closed', 'polish_closed') THEN 'x_button' ELSE 'settings' END AS source
      FROM ev WHERE name IN ('translation_turned_off', 'card_closed', 'polish_closed')
        OR (name = 'translation_toggled' AND (props->>'on')::boolean = false)
    ),
    b AS (SELECT device_id, w, feature FROM shown UNION SELECT device_id, w, 'all' FROM shown),
    o AS (
      SELECT device_id, w, feature, bool_or(source = 'x_button') AS x, bool_or(source = 'shortcut') AS sc,
        bool_or(source = 'settings') AS st
      FROM (SELECT device_id, w, feature, source FROM offs UNION ALL SELECT device_id, w, 'all', source FROM offs) u
      GROUP BY 1, 2, 3
    )
    SELECT to_char(b.w, 'YYYY-MM-DD') AS label, b.w = date_trunc('week', ${TODAY})::date AS current, b.feature,
      count(*)::int AS den, count(o.device_id)::int AS num, count(*) FILTER (WHERE o.x)::int AS x,
      count(*) FILTER (WHERE o.sc)::int AS shortcut, count(*) FILTER (WHERE o.st)::int AS settings
    FROM b LEFT JOIN o USING (device_id, w, feature)
    WHERE b.w >= date_trunc('week', ${TODAY})::date - 56
    GROUP BY b.w, b.feature ORDER BY b.w DESC, b.feature`);
  const [currentlyOff] = await q<{ translate_off: number; translate_n: number; polish_off: number; polish_n: number }>(`
    WITH latest AS (
      SELECT DISTINCT ON (device_id) device_id, props FROM ${EV(R + 2)} e
      WHERE name = 'input_time_daily' AND props ? 'day' AND (props->>'day')::date > ${TODAY} - ${R}
        AND coalesce((props->>'commits')::int, 0) >= 1
      ORDER BY device_id, props->>'day' DESC, ts DESC
    )
    SELECT count(*) FILTER (WHERE (props->>'translate_on')::boolean = false)::int AS translate_off,
      count(*) FILTER (WHERE props ? 'translate_on')::int AS translate_n,
      count(*) FILTER (WHERE (props->>'polish_on')::boolean = false)::int AS polish_off,
      count(*) FILTER (WHERE props ? 'polish_on')::int AS polish_n
    FROM latest`);

  const toggledOff = await q<Count>(`
    SELECT feature || ' · ' || scope || CASE WHEN scope = 'app' THEN ' · ' || coalesce(cat, '?') ELSE '' END AS label,
      count(*)::int AS n
    FROM (
      SELECT DISTINCT ON (device_id, props->>'feature', props->>'scope', props->>'app_category')
        coalesce(props->>'feature', 'translate') AS feature, coalesce(props->>'scope', 'global') AS scope,
        props->>'app_category' AS cat,
        CASE name WHEN 'translation_turned_off' THEN false WHEN 'translation_turned_on' THEN true
          ELSE (props->>'on')::boolean END AS is_on
      FROM ${ALL} e
      WHERE name IN ('translation_turned_off', 'translation_turned_on') OR (name = 'translation_toggled' AND props ? 'on')
      ORDER BY device_id, props->>'feature', props->>'scope', props->>'app_category', ts DESC
    ) latest WHERE NOT latest.is_on GROUP BY 1 ORDER BY n DESC`);
  const [replaceTotal] = await q<{ total: number; failed: number }>(`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT ${OK})::int AS failed
    FROM ${EV(R)} e WHERE name = 'card_replaced'`);
  const replaceFailures = await q<Count>(`
    SELECT coalesce(props->>'fail_reason', '?') || ' · ' || coalesce(props->>'app_category', '未知应用类别') AS label,
      count(*)::int AS n
    FROM ${EV(R)} e WHERE name = 'card_replaced' AND NOT ${OK} GROUP BY 1 ORDER BY n DESC LIMIT 12`);
  const crashes = await q<{ label: string; crashes: number; mins: number }>(`
    WITH ev AS (SELECT e.*, b.app_version FROM ${EV(R)} e JOIN batches b USING (batch_id)),
    m AS (
      SELECT app_version, sum(mins)::int AS mins FROM (
        SELECT app_version, device_id, props->>'day', max((props->>'youdao_typing_min')::int) AS mins
        FROM ev WHERE name = 'input_time_daily' AND props ? 'day' GROUP BY 1, 2, 3) x GROUP BY 1
    ),
    c AS (SELECT app_version, count(*)::int AS crashes FROM ev WHERE name = 'ime_restarted'
      AND coalesce(props->>'kind', 'crash') <> 'system' GROUP BY 1)
    SELECT coalesce(m.app_version, c.app_version) AS label, coalesce(c.crashes, 0)::int AS crashes,
      coalesce(m.mins, 0)::int AS mins
    FROM m FULL JOIN c USING (app_version) ORDER BY label DESC LIMIT 10`);

  // ---------- 5 学习 ----------
  // Official denominator: active (>= 1 commit via 有道) that week. Until
  // clients send input_time_daily the page also shows an interim one: any event that week.
  const WEEKS = `
    ev AS ${EV(70)},
    inter AS (
      SELECT device_id, date_trunc('week', ${DAY})::date AS w, count(*)::int AS n
      FROM ev WHERE name IN (${LEARNING_IN}) GROUP BY 1, 2
    ),
    act AS (
      SELECT DISTINCT device_id, date_trunc('week', (props->>'day')::date)::date AS w
      FROM ev WHERE name = 'input_time_daily' AND props ? 'day' AND coalesce((props->>'commits')::int, 0) >= 1
    ),
    seen AS (SELECT DISTINCT device_id, date_trunc('week', ${DAY})::date AS w FROM ev),
    lw AS (SELECT (date_trunc('week', ${TODAY}) - interval '7 days')::date AS w)`;
  const weeks = await q<{ label: string; current: boolean; act: number; act_learn: number; seen: number; seen_learn: number }>(`
    WITH ${WEEKS},
    wk AS (SELECT generate_series(date_trunc('week', ${TODAY}) - interval '8 weeks', date_trunc('week', ${TODAY}), '1 week')::date AS w)
    SELECT to_char(wk.w, 'YYYY-MM-DD') AS label, wk.w = date_trunc('week', ${TODAY})::date AS current,
      (SELECT count(*) FROM act a WHERE a.w = wk.w)::int AS act,
      (SELECT count(*) FROM act a JOIN inter i USING (device_id, w) WHERE a.w = wk.w)::int AS act_learn,
      (SELECT count(*) FROM seen s WHERE s.w = wk.w)::int AS seen,
      (SELECT count(*) FROM seen s JOIN inter i USING (device_id, w) WHERE s.w = wk.w)::int AS seen_learn
    FROM wk ORDER BY wk.w DESC`);
  const officialLearning = (presence.input_time_daily ?? []).includes("commits");
  const BASE = officialLearning ? "act" : "seen";
  const learnBuckets = await q<Count>(`
    WITH ${WEEKS}
    SELECT label, count(*)::int AS n FROM (
      SELECT CASE WHEN coalesce(i.n, 0) = 0 THEN '0' WHEN i.n <= 2 THEN '1–2' WHEN i.n <= 9 THEN '3–9' ELSE '10+' END AS label,
        coalesce(i.n, 0) AS n
      FROM ${BASE} b JOIN lw USING (w) LEFT JOIN inter i USING (device_id, w)
    ) x GROUP BY label ORDER BY min(n)`);
  const [learnMedian] = await q<{ p50: number | null }>(`
    WITH ${WEEKS}
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY i.n) AS p50
    FROM ${BASE} b JOIN lw USING (w) JOIN inter i USING (device_id, w)`);
  const learnByType = await q<{ label: string; n: number; devices: number; base: number }>(`
    WITH ${WEEKS}, b AS (SELECT device_id FROM ${BASE} JOIN lw USING (w))
    SELECT t.name AS label,
      (SELECT count(*) FROM ev, lw WHERE ev.name = t.name AND date_trunc('week', ${DAY})::date = lw.w
        AND ev.device_id IN (SELECT device_id FROM b))::int AS n,
      (SELECT count(DISTINCT device_id) FROM ev, lw WHERE ev.name = t.name AND date_trunc('week', ${DAY})::date = lw.w
        AND ev.device_id IN (SELECT device_id FROM b))::int AS devices,
      (SELECT count(*) FROM b)::int AS base
    FROM unnest(ARRAY[${LEARNING_IN}]) AS t(name)`);
  const learnByLevel = await q<Rate>(`
    WITH ${WEEKS}, b AS (SELECT device_id FROM ${BASE} JOIN lw USING (w)),
    lvl AS (
      SELECT DISTINCT ON (device_id) device_id, level FROM (
        SELECT device_id, english_level AS level, received_at AS at FROM batches WHERE english_level IS NOT NULL
        UNION ALL
        SELECT device_id, props->>'level', ts FROM events WHERE name = 'level_setting' AND props->>'kind' = 'english'
      ) x ORDER BY device_id, at DESC
    )
    SELECT coalesce(lvl.level, '未知') AS label,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inter i, lw WHERE i.device_id = b.device_id AND i.w = lw.w))::int AS num,
      count(*)::int AS den
    FROM b LEFT JOIN lvl USING (device_id) GROUP BY 1 ORDER BY 1`);

  const [learned] = await q<{ highlighted: number; typed: number }>(`
    SELECT
      count(*) FILTER (WHERE name = 'word_first_highlighted'
        AND ts BETWEEN now() - interval '30 days' AND now() - interval '14 days')::int AS highlighted,
      count(*) FILTER (WHERE name = 'word_typed_back' AND coalesce((props->>'days_since_highlight')::int, 99) <= 14
        AND ts - make_interval(days => (props->>'days_since_highlight')::int)
            BETWEEN now() - interval '30 days' AND now() - interval '14 days')::int AS typed
    FROM ${EV(45)} e WHERE name IN ('word_first_highlighted', 'word_typed_back')`);
  const [wordBook] = await q<{ added: number; devices: number; reviewed: number; known: number }>(`
    SELECT count(*) FILTER (WHERE name = 'word_added_to_book')::int AS added,
      count(DISTINCT device_id) FILTER (WHERE name = 'word_added_to_book')::int AS devices,
      count(*) FILTER (WHERE name = 'word_reviewed' AND props->>'result' IN ('known', 'unknown'))::int AS reviewed,
      count(*) FILTER (WHERE name = 'word_reviewed' AND props->>'result' = 'known')::int AS known
    FROM ${EV(R)} e WHERE name IN ('word_added_to_book', 'word_reviewed')`);
  const [learnNotTranslate] = await q<{ n: number; den: number }>(`
    WITH per AS (
      SELECT device_id,
        count(*) FILTER (WHERE name = 'card_shown') AS shown,
        count(*) FILTER (WHERE name = 'card_replaced' AND ${OK}) AS adopted,
        count(*) FILTER (WHERE name IN (${LEARNING_IN})) AS learn
      FROM ${EV(R)} e GROUP BY 1
    )
    SELECT count(*) FILTER (WHERE learn >= 3 AND (shown = 0 OR adopted::float / nullif(shown, 0) < 0.2))::int AS n,
      count(*)::int AS den FROM per`);

  // ---------- 按应用 ----------
  // An app is its bundle_id (Mac) or lowercased exe name (Windows). Devices come
  // from app_used; cards and typing need bundle_id on their own events.
  type AppRow = { label: string; name: string | null; apps: number; devices: number; chars: number; en: number;
    shown: number; adopted: number; off: number };
  const appView = (order: "devices" | "volume") => q<AppRow>(`
    WITH au AS (
      SELECT device_id, lower(props->>'bundle_id') AS app, props->>'app_name' AS name
      FROM ${EV(R)} e WHERE name = 'app_used' AND props ? 'bundle_id'
    ),
    ty AS (
      SELECT device_id, lower(props->>'bundle_id') AS app,
        coalesce((props->>'chars')::int, 0) AS chars, coalesce((props->>'en_chars')::int, 0) AS en
      FROM ${EV(R)} e WHERE name = 'typing_stats' AND props ? 'bundle_id'
    ),
    cs AS (
      SELECT props->>'card_id' AS cid, max(lower(props->>'bundle_id')) AS app
      FROM ${EV(R)} e WHERE name = 'card_shown' AND props ? 'bundle_id' AND props ? 'card_id' GROUP BY 1
    ),
    co AS (
      SELECT coalesce(props->>'card_id', props->>'recent_card_id') AS cid,
        bool_or(name = 'card_replaced' AND ${OK}) AS adopted,
        bool_or(name IN ('translation_turned_off', 'card_closed')
          OR (name = 'translation_toggled' AND (props->>'on')::boolean = false)) AS off
      FROM ${EV(R + 1)} e WHERE name IN ('card_replaced', 'translation_turned_off', 'card_closed', 'translation_toggled')
      GROUP BY 1
    ),
    apps AS (SELECT app FROM au UNION SELECT app FROM ty UNION SELECT app FROM cs),
    score AS (
      SELECT a.app, (SELECT count(DISTINCT device_id) FROM au WHERE au.app = a.app) AS devices,
        (SELECT coalesce(sum(chars + en), 0) FROM ty WHERE ty.app = a.app) AS volume
      FROM apps a
    ),
    lab AS (
      SELECT app, r, CASE WHEN r <= 10 AND ${order} > 0 THEN app ELSE '其他' END AS label
      FROM (SELECT app, devices, volume, row_number() OVER (ORDER BY ${order} DESC, devices DESC, app) AS r FROM score) x
    ),
    nm AS (
      SELECT DISTINCT ON (app) app, name FROM au WHERE name IS NOT NULL GROUP BY app, name ORDER BY app, count(*) DESC
    ),
    dv AS (SELECT label, count(DISTINCT device_id) AS devices FROM au JOIN lab USING (app) GROUP BY 1),
    tv AS (SELECT label, sum(chars) AS chars, sum(en) AS en FROM ty JOIN lab USING (app) GROUP BY 1),
    cv AS (
      SELECT label, count(*) AS shown, count(*) FILTER (WHERE co.adopted) AS adopted, count(*) FILTER (WHERE co.off) AS off
      FROM cs JOIN lab USING (app) LEFT JOIN co USING (cid) GROUP BY 1
    ),
    g AS (SELECT label, min(r) AS r, count(*) AS apps, max(nm.name) AS name FROM lab LEFT JOIN nm USING (app) GROUP BY 1)
    SELECT g.label, CASE WHEN g.label = '其他' THEN NULL ELSE g.name END AS name, g.apps::int,
      coalesce(dv.devices, 0)::int AS devices, coalesce(tv.chars, 0)::int AS chars, coalesce(tv.en, 0)::int AS en,
      coalesce(cv.shown, 0)::int AS shown, coalesce(cv.adopted, 0)::int AS adopted, coalesce(cv.off, 0)::int AS off
    FROM g LEFT JOIN dv USING (label) LEFT JOIN tv USING (label) LEFT JOIN cv USING (label)
    ORDER BY g.label = '其他', g.r`);
  const appsByDevices = await appView("devices");
  const appsByVolume = await appView("volume");
  // Every app_used row ever, by the platform os_version implies.
  const appCoverage = await q<{ platform: string; rows: number; bundle: number; name: number; devices: number; apps: number }>(`
    SELECT CASE WHEN b.os_version ILIKE 'windows%' THEN 'windows' ELSE 'mac' END AS platform,
      count(*)::int AS rows, count(*) FILTER (WHERE e.props ? 'bundle_id')::int AS bundle,
      count(*) FILTER (WHERE e.props ? 'app_name')::int AS name,
      count(DISTINCT e.device_id) FILTER (WHERE e.props ? 'bundle_id')::int AS devices,
      count(DISTINCT lower(e.props->>'bundle_id'))::int AS apps
    FROM events e JOIN batches b USING (batch_id) WHERE e.name = 'app_used' GROUP BY 1 ORDER BY 1`);

  // ---------- 运行情况 ----------
  const versions = await q<Count>(`
    SELECT platform || ' · ' || app_version AS label, count(*)::int AS n FROM (
      SELECT DISTINCT ON (device_id) device_id, app_version,
        coalesce(platform, CASE WHEN os_version ILIKE 'windows%' THEN 'windows' ELSE 'mac' END) AS platform
      FROM batches WHERE received_at >= now() - interval '30 days'
      ORDER BY device_id, received_at DESC) latest
    GROUP BY 1 ORDER BY n DESC LIMIT 15`);

  return {
    range: R,
    ov: { series, installDaily, activeDaily, hitSeries, disruptSeries, basics, verDist, officialActive, sampleDays, sampleTotals },
    presence, meta, overview, cohorts: cohorts.n,
    q1: { retention, cohortRows, activeTrend, daily, charsDist, awayDist, enDominant, enByApp, awayTime, toKinds, activeEnglish, survey },
    q2: { typing, typingByDay, typingByPlatform, typingByApp, typingBySinceInstall, typingByImport, struggle,
      dictImport, dictSources, userWords, candidates },
    q3: { adoption, adoptByTone, adoptByApp, adoptByLen, outcomes, downAdopted, downReasons, latency, latencyByDay,
      errorCodes, polish, polishLatency },
    q4: { disrupt, disruptByDay, legacyEsc, xPerDevice, reopen, neverReopened, weeklyOff, currentlyOff, keyLatency, toggledOff, replaceTotal, replaceFailures, crashes },
    q5: { weeks, officialLearning, learnBuckets, learnMedian, learnByType, learnByLevel, learned, wordBook, learnNotTranslate },
    apps: { byDevices: appsByDevices, byVolume: appsByVolume, coverage: appCoverage },
    versions,
  };
}

export type Stats = Awaited<ReturnType<typeof loadStats>>;
