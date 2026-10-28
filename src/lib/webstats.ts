import { db, ensureSchema } from "./db";
import { SITE, beijingDay, device, hitSecret, visitorId, type Hit } from "./hits";

/** Per visitor per day; anything past this is a script, not a person. */
const DAILY_CAP = 300;

export const clientIp = (req: { headers: Headers; ip?: string }) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.ip || "unknown";

/** Stores one hit. Downloads are counted once per visitor, file and day. Never throws. */
export async function recordHit(hit: Hit, ip: string, ua: string): Promise<void> {
  const secret = hitSecret();
  if (!secret) return;
  try {
    await ensureSchema();
    const day = beijingDay();
    const visitor = await visitorId(secret, day, ip, ua);
    const { ref, utm_source, utm_medium, utm_campaign, ...props } = hit.props;
    await db().query(
      `INSERT INTO web_hits (site, day, visitor, name, device, ref, utm_source, utm_medium, utm_campaign, props)
       SELECT $1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
       WHERE (SELECT count(*) FROM web_hits WHERE day = $2::date AND visitor = $3) < ${DAILY_CAP}
         AND ($4 <> 'download' OR NOT EXISTS (SELECT 1 FROM web_hits
           WHERE day = $2::date AND visitor = $3 AND name = 'download' AND props->>'path' = $10::jsonb->>'path'))`,
      [SITE, day, visitor, hit.name, device(ua), ref ?? null, utm_source ?? null, utm_medium ?? null, utm_campaign ?? null,
        JSON.stringify(props)],
    );
  } catch (err) {
    console.error("hit: store failed", err instanceof Error ? err.message : "unknown");
  }
}

export interface HomeDay {
  day: string; visitors: number; views: number; tries: number; tried: number; videos: number;
  join_views: number; join_clicks: number; click_mac: number; click_windows: number; dl_mac: number; dl_windows: number;
}
export interface Label { label: string; n: number }

/** The homepage section of the dashboard: the last `days` Beijing days, today included. */
export async function loadHomeStats(days: number) {
  await ensureSchema();
  const q = async <T>(sql: string) => (await db().query(sql, [SITE, days])).rows as T[];
  const W = `site = $1 AND day > (now() AT TIME ZONE 'Asia/Shanghai')::date - $2::int`;
  const BROWSER_DL = `name = 'download' AND props->>'client' = 'browser'`;
  const [daily, funnel, refs, utms, devices, videos, joins, clicks, downloads, tries] = await Promise.all([
    q<HomeDay>(`
      SELECT to_char(day, 'YYYY-MM-DD') AS day,
        count(DISTINCT visitor) FILTER (WHERE name = 'view')::int AS visitors,
        count(*) FILTER (WHERE name = 'view')::int AS views,
        count(*) FILTER (WHERE name = 'try')::int AS tries,
        count(DISTINCT visitor) FILTER (WHERE name = 'try')::int AS tried,
        count(*) FILTER (WHERE name = 'video_play')::int AS videos,
        count(DISTINCT visitor) FILTER (WHERE name = 'join_view')::int AS join_views,
        count(*) FILTER (WHERE name = 'join_click')::int AS join_clicks,
        count(*) FILTER (WHERE name = 'download_click' AND props->>'platform' = 'mac')::int AS click_mac,
        count(*) FILTER (WHERE name = 'download_click' AND props->>'platform' = 'windows')::int AS click_windows,
        count(*) FILTER (WHERE ${BROWSER_DL} AND props->>'platform' = 'mac')::int AS dl_mac,
        count(*) FILTER (WHERE ${BROWSER_DL} AND props->>'platform' = 'windows')::int AS dl_windows
      FROM web_hits WHERE ${W} GROUP BY day ORDER BY day`),
    // Visitor-days: a visitor id lasts one day, so each step counts (day, visitor) pairs that also did the earlier steps.
    q<{ visitors: number; tried: number; clicked: number; downloaded: number }>(`
      WITH v AS (
        SELECT day, visitor,
          bool_or(name = 'view') AS viewed, bool_or(name = 'try') AS tried,
          bool_or(name = 'download_click') AS clicked, bool_or(${BROWSER_DL}) AS downloaded
        FROM web_hits WHERE ${W} GROUP BY day, visitor)
      SELECT count(*) FILTER (WHERE viewed)::int AS visitors,
        count(*) FILTER (WHERE viewed AND tried)::int AS tried,
        count(*) FILTER (WHERE viewed AND clicked)::int AS clicked,
        count(*) FILTER (WHERE viewed AND downloaded)::int AS downloaded
      FROM v`),
    q<Label>(`SELECT coalesce(ref, '直接访问') AS label, count(*)::int AS n FROM web_hits
      WHERE ${W} AND name = 'view' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`),
    q<Label>(`SELECT concat_ws(' / ', utm_source, utm_medium, utm_campaign) AS label, count(*)::int AS n FROM web_hits
      WHERE ${W} AND name = 'view' AND utm_source IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`),
    q<Label>(`SELECT device AS label, count(DISTINCT (day, visitor))::int AS n FROM web_hits
      WHERE ${W} AND name = 'view' GROUP BY 1 ORDER BY 2 DESC`),
    q<Label>(`SELECT props->>'video' AS label, count(*)::int AS n FROM web_hits
      WHERE ${W} AND name = 'video_play' GROUP BY 1 ORDER BY 2 DESC`),
    q<Label>(`SELECT coalesce(props->>'from', '?') AS label, count(*)::int AS n FROM web_hits
      WHERE ${W} AND name = 'join_click' GROUP BY 1 ORDER BY 2 DESC`),
    q<Label>(`SELECT props->>'platform' AS label, count(*)::int AS n FROM web_hits
      WHERE ${W} AND name = 'download_click' GROUP BY 1 ORDER BY 2 DESC`),
    q<{ platform: string; version: string; client: string; n: number }>(`
      SELECT props->>'platform' AS platform, props->>'version' AS version, props->>'client' AS client, count(*)::int AS n
      FROM web_hits WHERE ${W} AND name = 'download' GROUP BY 1, 2, 3 ORDER BY 1, 2 DESC, 3`),
    q<Label>(`SELECT coalesce(props->>'source', '?') AS label, count(*)::int AS n FROM web_hits
      WHERE ${W} AND name = 'try' GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  const today = Date.parse(`${beijingDay()}T00:00:00Z`);
  const zero = (day: string): HomeDay => ({ day, visitors: 0, views: 0, tries: 0, tried: 0, videos: 0, join_views: 0,
    join_clicks: 0, click_mac: 0, click_windows: 0, dl_mac: 0, dl_windows: 0 });
  const filled = Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10))
    .map((d) => daily.find((r) => r.day === d) ?? zero(d));
  return { daily: filled, funnel: funnel[0], refs, utms, devices, videos, joins, clicks, downloads, tries };
}
