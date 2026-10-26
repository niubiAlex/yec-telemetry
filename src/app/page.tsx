import type { ReactNode } from "react";
import { RANGES, loadStats, type Cohort, type Count, type Platform, type Presence, type Rate } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TONE: Record<string, string> = { chat: "闲聊", work: "工作", academic: "学术", "?": "未知" };
const APP: Record<string, string> = { chat: "聊天", mail: "邮件", doc: "文档", code: "写代码", other: "其他", "?": "未知" };
const LEN: Record<string, string> = { s: "短（≤10 字）", m: "中（11–30）", l: "长（31–80）", xl: "很长（>80）", "?": "未知" };
const TO_KIND: Record<string, string> = { cjk_ime: "其他中文输入法", latin_layout: "系统英文键盘", other: "其他", "?": "未知" };
const OUTCOME: Record<string, string> = {
  adopted: "采纳", undone: "采纳后撤销", edited: "采纳后大改", failed: "出卡失败", closed: "关掉翻译", esc: "Esc",
  glanced: "看过未采纳（中性）", none: "没看也没操作（中性）",
};
const OUTCOME_ORDER = ["adopted", "undone", "edited", "glanced", "esc", "closed", "failed", "none"];
const LEARNING: Record<string, string> = {
  new_word_clicked: "点击生词", gloss_clicked: "点击释义", recall_clicked: "点击回顾提示", word_added_to_book: "加入生词本",
  dict_opened: "打开小词典", learning_dashboard_opened: "打开学习面板", word_marked_known: "标记已认识", word_reviewed: "复习一个词",
};
const NEW_LEARNING = new Set(["gloss_clicked", "word_added_to_book", "learning_dashboard_opened", "word_marked_known", "word_reviewed"]);
const OFF_SOURCE: Record<string, string> = { x_button: "点 X", shortcut: "开关快捷键", settings: "设置" };
const REASON: Record<string, string> = {
  wrong_meaning: "意思错了", unnatural: "不自然", wrong_tone: "语气不对", too_long: "太长", other: "其他", 未选: "未选",
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const pctOf = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined, digits = 0) => (v == null ? "–" : v.toFixed(digits));
const ms = (v: number | null) => (v == null ? "–" : `${v} ms`);

function Pending({ need }: { need: string }) {
  return <span className="pending" title={`需要客户端上报：${need}`}>客户端待上报</span>;
}

function Kpi({ label, value, ready = true, need = "", note, big }: {
  label: string; value: ReactNode; ready?: boolean; need?: string; note?: string; big?: boolean;
}) {
  return (
    <div className={big ? "kpi key" : "kpi"}>
      <b>{ready ? value : <Pending need={need} />}</b>
      <span>{label}</span>
      {note && <small>{note}</small>}
      {!ready && need && <small>需要：{need}</small>}
    </div>
  );
}

function Bars({ rows, label = (s: string) => s, unit = "", ready = true, need = "" }: {
  rows: Count[]; label?: (s: string) => string; unit?: string; ready?: boolean; need?: string;
}) {
  if (!ready) return <p><Pending need={need} /> <small className="note">需要：{need}</small></p>;
  if (rows.length === 0) return <p className="empty">暂无数据</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{label(r.label)}</td>
            <td>{r.n}{unit}</td>
            <td className="bar" aria-hidden="true"><i style={{ width: `${(r.n / max) * 100}%` }} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PendingBlock({ need }: { need: string }) {
  return <p><Pending need={need} /> <small className="note">需要：{need}</small></p>;
}

function Question({ n, title, ask, children }: { n: number; title: string; ask: string; children: ReactNode }) {
  return (
    <section className="question" id={`q${n}`}>
      <h2><span className="qn">问题 {n}</span>{title}</h2>
      <p className="sub">{ask}</p>
      {children}
    </section>
  );
}

const WINDOWS = [1, 3, 7, 14] as const;

function Curve({ active, main }: { active: (number | null)[]; main: (number | null)[] }) {
  const W = 360, H = 140, P = 28;
  const x = (i: number) => P + (i * (W - 2 * P)) / (WINDOWS.length - 1);
  const y = (v: number) => H - P - v * (H - 2 * P);
  const line = (vs: (number | null)[]) =>
    vs.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve" role="img" aria-label="活跃与主力留存曲线">
      {[0, 0.5, 1].map((v) => (
        <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="grid" />
          <text x={4} y={y(v) + 4}>{v * 100}%</text></g>
      ))}
      {WINDOWS.map((k, i) => <text key={k} x={x(i) - 10} y={H - 6}>第 {k} 天</text>)}
      <polyline points={line(active)} className="l-active" />
      <polyline points={line(main)} className="l-main" />
    </svg>
  );
}

function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <svg className="spark" aria-hidden="true" />;
  const W = 72, H = 20;
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const x = (i: number) => (i * W) / Math.max(1, values.length - 1);
  const y = (v: number) => (hi === lo ? H / 2 : H - 2 - ((v - lo) / (hi - lo)) * (H - 4));
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts.map(([i, v]) => `${x(i)},${y(v)}`).join(" ")} />
    </svg>
  );
}

function Trend({ rows }: { rows: { label: string; active: number; main: number }[] }) {
  const W = 720, H = 160, P = 28;
  const max = Math.max(1, ...rows.map((r) => r.active));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (k: "active" | "main") => rows.map((r, i) => `${x(i)},${y(r[k])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve wide" role="img" aria-label="每日活跃设备与主力设备">
      {[0, 0.5, 1].map((v) => (
        <g key={v}><line x1={P} x2={W - P} y1={y(v * max)} y2={y(v * max)} className="grid" />
          <text x={2} y={y(v * max) + 4}>{Math.round(v * max)}</text></g>
      ))}
      {rows.map((r, i) => (i % 5 === 0 || i === rows.length - 1) && <text key={r.label} x={x(i) - 12} y={H - 6}>{r.label}</text>)}
      <polyline points={line("active")} className="l-active" />
      <polyline points={line("main")} className="l-main" />
    </svg>
  );
}

export default async function Page({ searchParams }: {
  searchParams: { platform?: string; active?: string; cohort?: string; range?: string };
}) {
  const platform: Platform | null =
    searchParams.platform === "mac" || searchParams.platform === "windows" ? searchParams.platform : null;
  const strict = searchParams.active === "chars20";
  const cohort: Cohort = searchParams.cohort === "day" ? "day" : "week";
  const range = (RANGES as readonly number[]).find((r) => String(r) === searchParams.range) ?? 7;
  const RL = `近 ${range} 天`;
  let s: Awaited<ReturnType<typeof loadStats>>;
  try {
    s = await loadStats({ platform, strict, cohort, range });
  } catch (err) {
    console.error(err);
    return <main><h1>读取失败</h1><p className="sub">数据库不可用，检查 DATABASE_URL。</p></main>;
  }
  const P: Presence = s.presence;
  const has = (name: string, key?: string) => name in P && (!key || P[name].includes(key));
  const href = (p: Platform | null, st: boolean = strict, c: Cohort = cohort, r: number = range, anchor = "") => {
    const qs = new URLSearchParams();
    if (r !== 7) qs.set("range", String(r));
    if (p) qs.set("platform", p);
    if (st) qs.set("active", "chars20");
    if (c === "day") qs.set("cohort", "day");
    const str = qs.toString();
    return (str ? `/?${str}` : "/") + anchor;
  };

  const daily = has("input_time_daily", "commits");
  const dailyChars = has("input_time_daily", "chars");
  const activeReady = strict ? dailyChars : daily;
  const NEED_DAILY = "input_time_daily（commits、chars、away_30m）";

  // Retention: the row with week = null is every cohort together.
  const { q1, q2, q3, q4, q5 } = s;
  const retentionWeeks = q1.cohortRows.map((r) => r.label);
  const cohortSize = Object.fromEntries(q1.cohortRows.map((r) => [r.label, r.n]));
  const cell = (week: string | null, k: number) => q1.retention.find((r) => r.week === week && r.k === k);
  const overall = (which: "active" | "main") =>
    WINDOWS.map((k) => { const r = cell(null, k); return r && r.den > 0 ? r[which] / r.den : null; });

  function RetentionTable({ which, ready }: { which: "active" | "main"; ready: boolean }) {
    const rows: (string | null)[] = [null, ...retentionWeeks];
    return (
      <table>
        <thead>
          <tr><th scope="col">{cohort === "day" ? "安装日" : "安装周"}</th><th scope="col">设备</th>{WINDOWS.map((k) => <th key={k} scope="col">第 {k} 天</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w ?? "all"}>
              <td>{w ? (cohort === "day" ? w : `${w} 那周`) : "全部"}</td><td>{w ? cohortSize[w] : s.cohorts}</td>
              {WINDOWS.map((k) => {
                const r = cell(w, k);
                if (!r) return <td key={k} className="muted" title="时间窗还没结束">—</td>;
                if (!ready) return <td key={k}><Pending need={NEED_DAILY} /></td>;
                return <td key={k}>{pct(r[which], r.den)} <small>({r[which]}/{r.den})</small></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const adoptTable = (rows: typeof q3.adoptByTone, label: Record<string, string>, ready: boolean, need: string) =>
    !ready ? <PendingBlock need={need} /> : rows.length === 0 ? <p className="empty">暂无数据</p> : (
      <table>
        <thead><tr><th scope="col">类别</th><th scope="col">展示</th><th scope="col">采纳</th><th scope="col">采纳率</th>
          <th scope="col">看过率</th></tr></thead>
        <tbody>
          {rows.filter((r) => r.shown > 0).map((r) => (
            <tr key={r.label}><td>{label[r.label] ?? r.label}</td><td>{r.shown}</td><td>{r.adopted}</td>
              <td>{pct(r.adopted, r.shown)}</td>
              <td>{has("card_glanced") ? pct(r.glanced, r.shown) : <Pending need="card_glanced" />}</td></tr>
          ))}
        </tbody>
      </table>
    );

  type T = { label: string; hit: number | null; kpc: number | null; abandon: number | null; n: number };
  const typingTable = (rows: T[], head: string, label: (s: string) => string = (x) => x) =>
    !has("typing_stats", "first_hit") ? <PendingBlock need="typing_stats（commits、first_hit、keys、chars、abandoned）" />
      : rows.length === 0 ? <p className="empty">暂无数据</p> : (
        <table>
          <thead><tr><th scope="col">{head}</th><th scope="col">首选命中率</th><th scope="col">每字按键</th>
            <th scope="col">放弃率</th><th scope="col">设备·天</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td>{label(r.label)}</td><td>{pctOf(r.hit)}</td><td>{num(r.kpc, 2)}</td>
                <td>{pctOf(r.abandon)}</td><td>{r.n}</td></tr>
            ))}
          </tbody>
        </table>
      );

  const d1 = q1.daily;
  const catMins = [
    { label: "chat", n: d1.m_chat }, { label: "mail", n: d1.m_mail }, { label: "doc", n: d1.m_doc },
    { label: "code", n: d1.m_code }, { label: "other", n: d1.m_other },
  ];

  const allDisrupt = q4.disrupt.find((r) => r.type === null && r.trig === null);
  const typeDisrupt = q4.disrupt.filter((r) => r.type !== null && r.trig === null);
  const trigDisrupt = q4.disrupt.filter((r) => r.type !== null && r.trig !== null);
  const turnedOff = has("translation_turned_off");
  const disruptReady = has("card_shown", "card_id") && turnedOff && has("ime_deactivated");
  const escWithId = has("card_dismissed", "card_id") && has("card_shown", "card_id");
  const NEED_DISRUPT = "card_shown.card_id、translation_turned_off、ime_deactivated.recent_card_id";
  const offAll = (r: { off_x: number; off_shortcut: number; off_settings: number }) => r.off_x + r.off_shortcut + r.off_settings;
  const reopenAll = q4.reopen.find((r) => r.label === null);
  const neverAll = q4.neverReopened.find((r) => r.feature === null);
  const minutes = (v: number | null | undefined) =>
    v == null ? "–" : v < 60 ? `${Math.round(v)} 分` : v < 1440 ? `${(v / 60).toFixed(1)} 小时` : `${(v / 1440).toFixed(1)} 天`;

  const polishAll = q3.polish.find((r) => r.dim === "all");
  const polishReady = has("polish_shown");
  const lastWeek = q5.weeks.find((w, i) => !w.current && i > 0) ?? q5.weeks[1];

  // ---------- 总览 ----------
  const ov = s.ov;
  const cur = <T,>(rows: (T & { cur: boolean })[]) => rows.filter((r) => r.cur);
  const prev = <T,>(rows: (T & { cur: boolean })[]) => rows.filter((r) => !r.cur);
  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  type Tile = { label: string; value: number | null; prev: number | null; spark: (number | null)[];
    ready: boolean; need: string; lowerIsBetter?: boolean; note?: string };
  const retTile = (k: number, which: "active" | "main", label: string): Tile => {
    const rows = ov.retentionDone.filter((r) => r.k === k);
    const rate = (rs: typeof rows) => ratio(sum(rs, (r) => r[which]), sum(rs, (r) => r.den));
    return { label, value: rate(cur(rows)), prev: rate(prev(rows)), spark: cur(rows).map((r) => ratio(r[which], r.den)),
      ready: which === "main" ? dailyChars : activeReady, need: NEED_DAILY };
  };
  const hitCur = ov.hitByPeriod.find((r) => r.cur);
  const hitPrev = ov.hitByPeriod.find((r) => !r.cur);
  const cardRate = (f: (r: (typeof ov.series)[number]) => number) => ({
    value: ratio(sum(cur(ov.series), f), sum(cur(ov.series), (r) => r.shown)),
    prev: ratio(sum(prev(ov.series), f), sum(prev(ov.series), (r) => r.shown)),
    spark: cur(ov.series).map((r) => ratio(f(r), r.shown)),
  });
  const intr = (r: (typeof ov.disruptSeries)[number]) => offAll(r) + r.esc + r.away;
  const weeksDone = q5.weeks.filter((w) => !w.current);
  const tiles: { q: number; title: string; items: Tile[] }[] = [
    { q: 1, title: "真需求 · 留存", items: [
      retTile(1, "active", "活跃 · 第 1 天"), retTile(7, "active", "活跃 · 第 7 天"), retTile(7, "main", "主力 · 第 7 天")] },
    { q: 2, title: "只打中文", items: [{ label: "首选命中率", value: hitCur?.hit ?? null, prev: hitPrev?.hit ?? null,
      spark: ov.hitSeries.slice(-range).map((r) => r.hit), ready: has("typing_stats", "first_hit"), need: "typing_stats" }] },
    { q: 3, title: "翻译准不准", items: [
      { label: "采纳率", ...cardRate((r) => r.adopted), ready: true, need: "",
        note: has("card_shown", "card_id") ? undefined : "按事件计" },
      { label: "看过率", ...cardRate((r) => r.glanced), ready: has("card_glanced"), need: "card_glanced" }] },
    { q: 4, title: "会不会打扰", items: [{ label: "打扰率", lowerIsBetter: true,
      value: ratio(sum(cur(ov.disruptSeries), intr), sum(cur(ov.disruptSeries), (r) => r.shown)),
      prev: ratio(sum(prev(ov.disruptSeries), intr), sum(prev(ov.disruptSeries), (r) => r.shown)),
      spark: cur(ov.disruptSeries).map((r) => ratio(intr(r), r.shown)), ready: disruptReady, need: "translation_turned_off、card_id" }] },
    { q: 5, title: "学习", items: [{ label: `周渗透率（${weeksDone[0]?.label.slice(5) ?? ""} 那周）`,
      value: weeksDone[0] ? ratio(weeksDone[0].act_learn, weeksDone[0].act) : null,
      prev: weeksDone[1] ? ratio(weeksDone[1].act_learn, weeksDone[1].act) : null,
      spark: weeksDone.slice(0, 8).reverse().map((w) => ratio(w.act_learn, w.act)),
      ready: q5.officialLearning, need: "input_time_daily.commits",
      note: q5.officialLearning ? undefined : `临时口径 ${pct(weeksDone[0]?.seen_learn ?? 0, weeksDone[0]?.seen ?? 0)}` }] },
  ];
  const devCur = ov.devicesByPeriod.find((r) => r.period === "cur")?.n ?? 0;
  const devPrev = ov.devicesByPeriod.find((r) => r.period === "prev")?.n ?? 0;
  const counts: { label: string; value: number; prev: number; ready: boolean; need: string; note?: string }[] = [
    { label: "有上报的设备", value: devCur, prev: devPrev, ready: true, need: "" },
    { label: "日均活跃设备", value: sum(cur(ov.series), (r) => r.active) / range, prev: sum(prev(ov.series), (r) => r.active) / range,
      ready: daily, need: "input_time_daily", note: `日均有上报 ${(sum(cur(ov.series), (r) => r.seen) / range).toFixed(1)}` },
    { label: "卡片展示", value: sum(cur(ov.series), (r) => r.shown), prev: sum(prev(ov.series), (r) => r.shown), ready: true, need: "" },
    { label: "样本上传", value: 0, prev: 0, ready: false, need: "POST /api/samples（采集端未开放）与客户端「帮助改进」" },
  ];
  const delta = (t: { value: number | null; prev: number | null; lowerIsBetter?: boolean; neutral?: boolean }, rate: boolean) => {
    if (t.value == null || t.prev == null) return <small className="delta">上期无数据</small>;
    const d = rate ? (t.value - t.prev) * 100 : t.prev > 0 ? ((t.value - t.prev) / t.prev) * 100 : null;
    if (d == null) return <small className="delta">上期为 0</small>;
    const good = t.lowerIsBetter ? d < 0 : d > 0;
    const txt = `${d > 0 ? "+" : ""}${d.toFixed(1)}${rate ? " pt" : "%"}`;
    return <small className={`delta ${t.neutral || Math.abs(d) < 0.05 ? "" : good ? "up" : "down"}`}>较上期 {txt}</small>;
  };

  // ---------- 基础数据 ----------
  type Day = (typeof ov.basics)[number];
  type Basic = { label: string; title: string; today: ReactNode; period: ReactNode; value: number | null; prev: number | null;
    rate: boolean; spark: (number | null)[]; ready: boolean; need: string; lowerIsBetter?: boolean; neutral?: boolean; note?: ReactNode };
  const bCur = cur(ov.basics), bPrev = prev(ov.basics);
  const bToday = ov.basics[ov.basics.length - 1];
  const fmt = (v: number | null, digits = 0) => (v == null ? "–" : v.toFixed(digits));
  const mean = (vs: (number | null)[]) => { const xs = vs.filter((v): v is number => v != null); return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null; };
  const rateOf = (rows: Day[], n: (r: Day) => number, d: (r: Day) => number) => ratio(sum(rows, n), sum(rows, d));
  const rateItem = (label: string, title: string, n: (r: Day) => number, d: (r: Day) => number,
    o: Partial<Basic> = {}): Basic => ({
    label, title, today: pctOf(bToday ? ratio(n(bToday), d(bToday)) : null), period: pctOf(rateOf(bCur, n, d)),
    value: rateOf(bCur, n, d), prev: rateOf(bPrev, n, d), rate: true, spark: bCur.map((r) => ratio(n(r), d(r))),
    ready: true, need: "", ...o,
  });
  const perItem = (label: string, title: string, n: (r: Day) => number, d: (r: Day) => number, digits: number,
    o: Partial<Basic> = {}): Basic => {
    const v = rateOf(bCur, n, d);
    return { label, title, today: fmt(bToday ? ratio(n(bToday), d(bToday)) : null, digits), period: fmt(v, digits),
      value: v, prev: rateOf(bPrev, n, d), rate: false, spark: bCur.map((r) => ratio(n(r), d(r))), ready: true, need: "", ...o };
  };
  const dailyMean = (label: string, title: string, f: (r: Day) => number | null, o: Partial<Basic> = {}): Basic => {
    const v = mean(bCur.map(f));
    return { label, title, today: fmt(bToday ? f(bToday) : null), period: fmt(v, 1), value: v, prev: mean(bPrev.map(f)),
      rate: false, spark: bCur.map(f), ready: true, need: "", ...o };
  };
  const total = (label: string, title: string, f: (r: Day) => number, o: Partial<Basic> = {}): Basic => ({
    label, title, today: bToday ? f(bToday) : "–", period: sum(bCur, f), value: sum(bCur, f), prev: sum(bPrev, f),
    rate: false, spark: bCur.map(f), ready: true, need: "", ...o,
  });
  const interim = ov.officialActive ? undefined : "临时：有上报即算活跃";
  const ACTIVE_DEF = ov.officialActive ? `活跃 = 当天${strict ? "上屏 ≥ 20 字" : "上屏 ≥ 1 次"}` : "还没有 input_time_daily，暂按当天有上报算活跃";
  const verTop = ov.verDist.slice(0, 3).map((v) => `${platform ? "" : v.platform === "windows" ? "Win " : "Mac "}${v.version} ${pct(v.n, sum(ov.verDist, (x) => x.n))}`).join("、");
  const minsTotal = sum(bCur, (r) => r.mins);
  const basicsItems: Basic[] = [
    total("安装（累计 · 新增）", "累计 = 添加过有道输入源的设备；新增按安装日（install_date，没有时取最早的 install / input_source_added）", (r) => r.inst_new, {
      today: <>{bToday?.inst_cum ?? 0} <small>+{bToday?.inst_new ?? 0}</small></>, period: `+${sum(bCur, (r) => r.inst_new)}` }),
    dailyMean("DAU", `每天的活跃设备；「${RL}」是日均。${ACTIVE_DEF}`, (r) => r.dau, { note: interim }),
    dailyMean("WAU", `截至当天的 7 天内活跃过的设备；「${RL}」是日均。${ACTIVE_DEF}`, (r) => r.wau, { note: interim }),
    { ...dailyMean("DAU / WAU", "每天 DAU ÷ 截至当天的 WAU，「近 N 天」取日均", (r) => ratio(r.dau, r.wau), { note: interim }),
      today: pctOf(bToday ? ratio(bToday.dau, bToday.wau) : null), period: pctOf(mean(bCur.map((r) => ratio(r.dau, r.wau)))), rate: true },
    rateItem(platform === "windows" ? "Windows 占比" : "Mac 占比", "当天有上报的设备按平台分；没有 platform 的旧版本按 os_version 判断",
      (r) => (platform === "windows" ? r.seen - r.mac : r.mac), (r) => r.seen, { neutral: true,
        note: platform ? "已按平台筛选" : `Windows ${pct(sum(bCur, (r) => r.seen - r.mac), sum(bCur, (r) => r.seen))}（${RL}）` }),
    rateItem("最新版本占比", `当天有上报的设备里，用的是该平台当时最新版本的比例。${RL}版本：${ov.verDist.map((v) => `${v.platform} ${v.version} ${v.n} 台`).join("，")}`,
      (r) => r.ver_latest, (r) => r.ver_n, { note: verTop || undefined }),
    rateItem("引导完成率", "第一次看到新手引导的设备里，完成了引导的比例，按第一次看到的那天分组", (r) => r.onb_done, (r) => r.onb_n,
      { ready: has("onboarding_shown"), need: "onboarding_shown、onboarding_completed" }),
    rateItem("导入词库率", "当天新装的设备里，至今导入过词库（added > 0）的比例", (r) => r.imported, (r) => r.inst_new),
    perItem("打字分钟 / 活跃设备·天", "有道打字分钟（youdao_typing_min）÷ 上屏 ≥ 1 次的设备·天", (r) => r.mins, (r) => r.dd, 1,
      { ready: has("input_time_daily", "youdao_typing_min"), need: "input_time_daily.youdao_typing_min" }),
    perItem("上屏字数 / 活跃设备·天", "上屏字数（chars）÷ 上屏 ≥ 1 次的设备·天；英文占比 = 自己打的英文 ÷ 上屏字数", (r) => r.chars, (r) => r.dd, 0,
      { ready: has("input_time_daily", "chars"), need: "input_time_daily.chars",
        note: has("input_time_daily", "chars_en_typed") ? `英文 今天 ${pct(bToday?.en ?? 0, bToday?.chars ?? 0)} · ${pct(sum(bCur, (r) => r.en), sum(bCur, (r) => r.chars))}` : <>英文占比 <Pending need="input_time_daily.chars_en_typed" /></> }),
    perItem("卡片展示 / 活跃设备·天", `中译英卡片展示（按 card_id 去重）÷ 当天活跃设备。${ACTIVE_DEF}`, (r) => r.cards, (r) => r.dau, 1, { note: interim }),
    total("学习互动（次）", "点生词、点释义、点回顾、加生词本、开小词典、开学习面板、标已认识、复习，次数合计", (r) => r.learn,
      { note: `今天 ${bToday?.learn_dev ?? 0} 台有互动` }),
    rateItem("翻译关着的设备", "当天上屏 ≥ 1 次的设备里，input_time_daily.translate_on = false 的比例；其余是开着", (r) => r.t_off, (r) => r.t_n,
      { lowerIsBetter: true, ready: has("input_time_daily", "translate_on"), need: "input_time_daily.translate_on" }),
    total("崩溃 / 重启（次）", "ime_restarted，不含 kind = system", (r) => r.crashes, {
      lowerIsBetter: true, ready: has("ime_restarted"), need: "ime_restarted",
      note: has("input_time_daily", "youdao_typing_min") && minsTotal > 0 ? `每千打字分钟 ${((sum(bCur, (r) => r.crashes) / minsTotal) * 1000).toFixed(1)}` : undefined }),
    rateItem("API 失败率", "sentence_latency 与 polish_latency 里 ok = false 的比例", (r) => r.api_err, (r) => r.api_n, { lowerIsBetter: true }),
    rateItem("「帮助改进」关闭率", "当天有上报、带 improve_on 的设备里，improve_on = false 的比例", (r) => r.imp_off, (r) => r.imp_n, {
      lowerIsBetter: true, ready: s.meta.improve_on > 0, need: "批次顶层 improve_on",
      note: <>样本数 <Pending need="POST /api/samples（采集端未开放）" /></> }),
  ];

  function Overview() {
    return (
      <section className="overview" aria-label="总览">
        <div className="counts">
          {counts.map((c) => (
            <div key={c.label} className="count">
              <span>{c.label}</span>
              <b>{c.ready ? (Number.isInteger(c.value) ? c.value : c.value.toFixed(1)) : <Pending need={c.need} />}</b>
              {c.ready && delta(c, false)}
              {c.note && c.ready && <small className="delta">{c.note}</small>}
            </div>
          ))}
        </div>
        <div className="tiles">
          {tiles.map((t) => (
            <a key={t.q} className="tile" href={`#q${t.q}`} aria-label={`问题 ${t.q}：${t.title}，查看详情`}>
              <h2><span className="qn">{t.q}</span>{t.title}</h2>
              {t.items.map((m) => (
                <div key={m.label} className="tm">
                  <span className="tl">{m.label}</span>
                  {m.ready ? <>
                    <b>{pctOf(m.value)}</b>
                    <Spark values={m.spark} />
                    {delta(m, true)}
                    {m.note && <small className="delta">{m.note}</small>}
                  </> : <><Pending need={m.need} />{m.note && <small className="delta">{m.note}</small>}</>}
                </div>
              ))}
            </a>
          ))}
        </div>
        <div className="basics">
          <h2>基础数据 <small>每格：今天 · {RL}（比率取整段，次数取合计，设备数取日均）· 较上期 · 走势；悬停看口径</small></h2>
          <div className="bgrid">
            {basicsItems.map((b) => (
              <div key={b.label} className="bc" title={b.title}>
                <span className="tl">{b.label}</span>
                {b.ready ? <>
                  <div className="bv"><span><small>今天</small><b>{b.today}</b></span><span><small>{RL}</small><b>{b.period}</b></span></div>
                  <div className="bf"><Spark values={b.spark} />{delta(b, b.rate)}</div>
                  {b.note && <small className="delta">{b.note}</small>}
                </> : <><Pending need={b.need} /><small className="delta">需要：{b.need}</small></>}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const outcomes = OUTCOME_ORDER.map((k) => ({ label: k, n: q3.outcomes.find((o) => o.label === k)?.n ?? 0 }));
  const levelRows = (rows: Rate[]) => rows.map((r) => ({ label: `${r.label}：${pct(r.num, r.den)}`, n: r.den }));

  return (
    <main>
      <h1>有道输入 · Beta 指标</h1>
      <p className="sub">
        上面是总览，点卡片跳到对应问题的详情。匿名统计，只有计数、枚举和错误码。日期按北京时间。
        <Pending need="" /> 表示客户端还没开始发需要的事件，不是 0。
      </p>

      <nav className="filters" aria-label="筛选：总览和下面的详情都按这里">
        <span>日期范围：</span>
        {RANGES.map((r) => <a key={r} href={href(platform, strict, cohort, r)} aria-current={range === r}>近 {r} 天</a>)}
        <span className="sep">平台：</span>
        <a href={href(null)} aria-current={!platform}>全部</a>
        <a href={href("mac")} aria-current={platform === "mac"}>Mac</a>
        <a href={href("windows")} aria-current={platform === "windows"}>Windows</a>
        <small className="note">「较上期」对比前一个 {range} 天。</small>
      </nav>

      <Overview />

      <Question n={1} title="是不是真需求" ask="用户会不会在真实输入里一直用它。">
        <nav className="filters" aria-label="留存口径">
          <span>「活跃」口径：</span>
          <a href={href(platform, false, cohort, range, "#q1")} aria-current={!strict}>当天上屏 ≥ 1 次</a>
          <a href={href(platform, true, cohort, range, "#q1")} aria-current={strict}>当天上屏 ≥ 20 字</a>
          <span className="sep">留存分组：</span>
          <a href={href(platform, strict, "day", range, "#q1")} aria-current={cohort === "day"}>按安装日</a>
          <a href={href(platform, strict, "week", range, "#q1")} aria-current={cohort === "week"}>按安装周</a>
        </nav>
        <h3>关键指标：两层留存</h3>
        <p className="note">
          分母：时间窗已结束、有 input_source_added 的设备（{s.cohorts} 台已添加）。第 3 / 7 / 14 天分别看第 3–4 / 7–9 / 14–16 天里任意一天；时间窗还没结束的格子显示「—」。留存表按安装日期分组，不受日期范围影响。
          活跃 = 当天{strict ? "上屏 ≥ 20 字" : "上屏 ≥ 1 次"}；主力 = 当天上屏 ≥ 200 字且「切走不回」≤ 1 次。
        </p>
        <div className="kpis four">
          {WINDOWS.map((k, i) => (
            <Kpi key={`a${k}`} big label={`活跃 · 第 ${k} 天`} value={pctOf(overall("active")[i])} ready={activeReady} need={NEED_DAILY} />
          ))}
          {WINDOWS.map((k, i) => (
            <Kpi key={`m${k}`} big label={`主力 · 第 ${k} 天`} value={pctOf(overall("main")[i])} ready={dailyChars} need={NEED_DAILY} />
          ))}
        </div>
        <div className="grid">
          <section><h4>活跃留存（按安装{cohort === "day" ? "日" : "周"}）</h4><RetentionTable which="active" ready={activeReady} /></section>
          <section><h4>主力留存（按安装{cohort === "day" ? "日" : "周"}）</h4><RetentionTable which="main" ready={dailyChars} /></section>
        </div>
        <h4>留存曲线（<span className="k-active">活跃</span> / <span className="k-main">主力</span>，两线之差是「还在用但不是主力」）</h4>
        {dailyChars ? <Curve active={overall("active")} main={overall("main")} /> : <PendingBlock need={NEED_DAILY} />}
        <h4>每日<span className="k-active">活跃设备</span>和<span className="k-main">主力设备</span>（{RL}）</h4>
        {dailyChars ? <Trend rows={q1.activeTrend} /> : <PendingBlock need={NEED_DAILY} />}

        <h3>辅助指标</h3>
        <div className="kpis">
          <Kpi label={`每日上屏字数中位数（${RL}）`} value={num(d1.chars_p50)} ready={dailyChars} need="input_time_daily.chars" />
          <Kpi label="每日有道打字分钟中位数" value={num(d1.mins_p50)} ready={has("input_time_daily", "youdao_typing_min")} need="input_time_daily.youdao_typing_min" />
          <Kpi label="英文输入占比（中位数）" value={pctOf(d1.en_ratio_p50)} ready={has("input_time_daily", "chars_en_typed")} need="input_time_daily.chars_en_typed"
            note={has("input_time_daily", "chars_en_card") ? `卡片替换进去的英文另计：${pct(d1.en_card, d1.chars)}` : undefined} />
          <Kpi label={`以英文为主的设备（${RL}）`} value={pct(q1.enDominant.num, q1.enDominant.den)} ready={has("input_time_daily", "chars_en_typed")} need="input_time_daily.chars_en_typed" />
          <Kpi label="每天切走 / 切回次数（中位数）" value={`${num(d1.sw_away_p50)} / ${num(d1.sw_back_p50)}`} ready={has("input_time_daily", "switch_away")} need="input_time_daily.switch_away、switch_back" />
          <Kpi label="离开时长 p50 / p90" value={`${num(q1.awayTime.p50 == null ? null : q1.awayTime.p50 / 60, 1)} / ${num(q1.awayTime.p90 == null ? null : q1.awayTime.p90 / 60, 1)} 分`} ready={has("ime_activated", "away_s")} need="ime_activated.away_s" />
          <Kpi label="每人每天主动用英文次数" value={q1.activeEnglish.days > 0 ? (q1.activeEnglish.n / q1.activeEnglish.days).toFixed(1) : "–"} ready={has("card_shown", "trigger") && daily} need="card_shown.trigger、input_time_daily" />
          <Kpi label="第 7 天问卷「非常失望」" value={pct(q1.survey.very, q1.survey.answered)} ready={has("survey_answered")} need="survey_shown / survey_answered"
            note={has("survey_shown") ? `回答率 ${pct(q1.survey.answered, q1.survey.shown)} · 参考线 40%` : "参考线 40%"} />
        </div>
        <div className="grid">
          <section><h4>门槛校准：每日上屏字数（设备·天，{RL}，200 字为主力线）</h4>
            <Bars rows={q1.charsDist} ready={dailyChars} need="input_time_daily.chars" /></section>
          <section><h4>门槛校准：每日「切走不回」次数（1 次为主力线）</h4>
            <Bars rows={q1.awayDist} ready={has("input_time_daily", "away_30m")} need="input_time_daily.away_30m" /></section>
          <section><h4>有道打字分钟按应用类别（{RL}）</h4>
            <Bars rows={catMins} label={(c) => APP[c] ?? c} unit=" 分" ready={has("input_time_daily", "typing_min_chat")} need="input_time_daily.typing_min_*" /></section>
          <section><h4>英文输入占比按应用类别（中位数，{RL}）</h4>
            <Bars rows={q1.enByApp.map((r) => ({ label: r.label, n: Math.round((r.p50 ?? 0) * 100) }))} unit="%" label={(c) => APP[c] ?? c}
              ready={has("typing_stats", "en_chars")} need="typing_stats.en_chars" /></section>
          <section><h4>切到哪类输入法（{RL}）</h4>
            <Bars rows={q1.toKinds} label={(k) => TO_KIND[k] ?? k} ready={has("ime_deactivated", "to_kind")} need="ime_deactivated.to_kind" /></section>
        </div>
      </Question>

      <Question n={2} title="换输入法的成本能不能忍" ask="只打中文时好不好用。">
        <h3>关键指标：首选命中率</h3>
        <p className="note">用候选第 1 个上屏的次数 ÷ 中文上屏次数，按设备·天算再取中位数，{RL}。</p>
        <div className="kpis">
          <Kpi big label={`首选命中率（${RL}中位数）`} value={pctOf(q2.typing.hit)} ready={has("typing_stats", "first_hit")} need="typing_stats.first_hit、commits" />
          <Kpi label="每字按键数" value={num(q2.typing.kpc, 2)} ready={has("typing_stats", "keys")} need="typing_stats.keys、chars" />
          <Kpi label="放弃率" value={pctOf(q2.typing.abandon)} ready={has("typing_stats", "abandoned")} need="typing_stats.abandoned" />
          <Kpi label="翻页 / 展开使用率" value={`${pct(q2.typing.paged, q2.typing.commits)} / ${pct(q2.typing.expanded, q2.typing.commits)}`} ready={has("typing_stats", "paged")} need="typing_stats.paged、expanded" />
          <Kpi label="挣扎后切走 / 全部切走" value={pct(q2.struggle.struggle, q2.struggle.total)} ready={has("ime_deactivated", "struggle")} need="ime_deactivated.struggle"
            note={has("ime_deactivated", "struggle") ? `发生过的设备 ${q2.struggle.devices} 台` : undefined} />
          <Kpi label="导入过词库的设备" value={pct(q2.dictImport.num, q2.dictImport.den)} note={`${q2.dictImport.num} / ${q2.dictImport.den} 台`} />
          <Kpi label={`「我的词」新增（${RL}）`} value={q2.userWords.reduce((a, r) => a + r.n, 0)} ready={has("user_word_added")} need="user_word_added" />
          <Kpi label="纯中文打字占比" value={pct(d1.zh_mins, d1.mins)} ready={has("input_time_daily", "zh_only_typing_min")} need="input_time_daily.zh_only_typing_min" />
        </div>
        <div className="grid">
          <section><h4>日趋势（{RL}）</h4>{typingTable(q2.typingByDay, "日期")}</section>
          <section><h4>按平台</h4>{typingTable(q2.typingByPlatform, "平台", (p) => (p === "windows" ? "Windows" : "Mac"))}
            <h4>安装后第 N 天（会不会越用越顺）</h4>{typingTable(q2.typingBySinceInstall, "安装后")}</section>
          <section><h4>按应用类别</h4>{typingTable(q2.typingByApp, "应用类别", (c) => APP[c] ?? c)}</section>
          <section><h4>导入词库 vs 没导入</h4>{typingTable(q2.typingByImport, "设备")}</section>
          <section><h4>导入词库来源（设备数）</h4><Bars rows={q2.dictSources} /></section>
          <section><h4>候选选第几个（{RL}，已有事件）</h4>
            <Bars rows={q2.candidates} label={(i) => `第 ${i === "9+" ? "10+" : Number(i) + 1} 个`} />
            <p className="note">candidate_index_chosen 可能不含空格选首选，不能代替首选命中率。</p></section>
        </div>
      </Question>

      <Question n={3} title="翻译够不够准，用户愿不愿意采纳" ask="展示了但没采纳不算失败；采纳率要和看过率一起读。">
        <h3>关键指标：卡片采纳率</h3>
        <p className="note">
          采纳 = card_replaced 中 ok ≠ false，按 card_id 去重，{RL}。当前客户端还不带 card_id，暂按事件计数。
        </p>
        <div className="kpis">
          <Kpi big label={`卡片采纳率（${RL}）`} value={pct(q3.adoption.adopted, q3.adoption.shown)} note={`${q3.adoption.adopted} / ${q3.adoption.shown}`} />
          <Kpi label="看过率" value={pct(q3.adoption.glanced, q3.adoption.shown)} ready={has("card_glanced")} need="card_glanced" />
          <Kpi label="有用率（采纳或看过）" value={pct(q3.adoption.useful, q3.adoption.shown)} ready={has("card_glanced") && has("card_shown", "card_id")} need="card_glanced、card_id" />
          <Kpi label="采纳后撤销率" value={pct(q3.adoption.undone, q3.adoption.adopted)} />
          <Kpi label="采纳后大改率" value={pct(q3.adoption.edited, q3.adoption.adopted)} ready={has("card_edited_after_replace")} need="card_edited_after_replace" />
          <Kpi label="采纳前换场景率" value={pct(q3.adoption.toneSwitched, q3.adoption.shown)} ready={has("tone_switched", "card_id")} need="tone_switched.card_id" />
          <Kpi label="出卡耗时 p50 / p90" value={`${ms(q3.latency.p50)} / ${ms(q3.latency.p90)}`} />
          <Kpi label="出卡失败率" value={pct(q3.latency.errors, q3.latency.n)} />
          <Kpi label="👍 比例" value={pct(q3.adoption.up, q3.adoption.up + q3.adoption.down)} ready={has("card_feedback")} need="card_feedback"
            note={has("card_feedback") ? `👎 后仍采纳 ${pct(q3.downAdopted.adopted, q3.downAdopted.down)}` : undefined} />
        </div>
        <div className="grid">
          <section><h4>按场景</h4>{adoptTable(q3.adoptByTone, TONE, true, "")}</section>
          <section><h4>按应用类别</h4>{adoptTable(q3.adoptByApp, APP, has("card_shown", "app_category"), "card_shown / card_replaced 的 app_category")}</section>
          <section><h4>按句长</h4>{adoptTable(q3.adoptByLen, LEN, has("card_shown", "len_bucket"), "card_shown / card_replaced 的 len_bucket")}</section>
          <section><h4>卡片去向（{RL}）</h4>
            <Bars rows={outcomes} label={(k) => OUTCOME[k] ?? k} ready={has("card_shown", "card_id")} need="card_id（卡片相关事件）" />
            <p className="note">「看过未采纳」和「没看也没操作」是中性的，不算负面。</p></section>
          <section><h4>出卡耗时日趋势</h4>
            {q3.latencyByDay.length === 0 ? <p className="empty">暂无数据</p> : (
              <table>
                <thead><tr><th scope="col">日期</th><th scope="col">请求</th><th scope="col">p50</th><th scope="col">p90</th><th scope="col">失败率</th></tr></thead>
                <tbody>{q3.latencyByDay.map((r) => (
                  <tr key={r.label}><td>{r.label}</td><td>{r.n}</td><td>{ms(r.p50)}</td><td>{ms(r.p90)}</td><td>{pct(r.errors, r.n)}</td></tr>
                ))}</tbody>
              </table>
            )}</section>
          <section><h4>失败错误码（{RL}）</h4><Bars rows={q3.errorCodes} />
            <h4>👎 原因</h4><Bars rows={q3.downReasons} label={(r) => REASON[r] ?? r} ready={has("card_feedback")} need="card_feedback" /></section>
        </div>

        <h3>英文润色（单独统计，不并入采纳率）</h3>
        <div className="kpis">
          <Kpi big label="润色采纳率" value={pct(polishAll?.accepted ?? 0, polishAll?.shown ?? 0)} ready={polishReady} need="polish_shown、polish_accepted" />
          <Kpi label="看过率" value={pct(polishAll?.glanced ?? 0, polishAll?.shown ?? 0)} ready={has("polish_glanced")} need="polish_glanced" />
          <Kpi label="采纳后撤销率" value={pct(polishAll?.undone ?? 0, polishAll?.accepted ?? 0)} ready={has("polish_undo_after_accept")} need="polish_undo_after_accept" />
          <Kpi label="关闭率" value={pct(polishAll?.closed ?? 0, polishAll?.shown ?? 0)} ready={has("polish_closed") || has("translation_turned_off")} need="translation_turned_off（feature=polish）" />
          <Kpi label="👍 比例" value={pct(polishAll?.up ?? 0, (polishAll?.up ?? 0) + (polishAll?.down ?? 0))} ready={has("polish_feedback")} need="polish_feedback" />
          <Kpi label="出建议耗时 p50 / p90" value={`${ms(s.q3.polishLatency.p50)} / ${ms(s.q3.polishLatency.p90)}`} ready={has("polish_latency")} need="polish_latency" />
        </div>
        {polishReady && (
          <div className="grid">
            <section><h4>润色按应用类别（采纳率）</h4>
              <Bars rows={q3.polish.filter((r) => r.dim === "app").map((r) => ({ label: `${APP[r.label] ?? r.label}：${pct(r.accepted, r.shown)}`, n: r.shown }))} /></section>
            <section><h4>润色按句长（采纳率）</h4>
              <Bars rows={q3.polish.filter((r) => r.dim === "len").map((r) => ({ label: `${r.label}：${pct(r.accepted, r.shown)}`, n: r.shown }))} /></section>
          </div>
        )}
      </Question>

      <Question n={4} title="会不会干扰正常打字" ask="只有关掉翻译（点 X、开关快捷键、设置）、Esc、出卡后切走三种明确的「不想要」算打扰；卡片自己消失不算。">
        <h3>关键指标：卡片打扰率</h3>
        <p className="note">打扰率 = 关掉翻译 + Esc + 出卡后切走，按卡片去重、归到最先发生的一种，{RL}。已弃用的 card_closed / polish_closed 计入「点 X」，translation_toggled 计入「设置」。</p>
        <div className="kpis">
          <Kpi big label={`打扰率（${RL}）`} ready={disruptReady} need={NEED_DISRUPT}
            value={allDisrupt ? pct(offAll(allDisrupt) + allDisrupt.esc + allDisrupt.away, allDisrupt.shown) : "–"} />
          <Kpi label="关掉翻译率" ready={turnedOff && has("card_shown", "card_id")} need="translation_turned_off、card_shown.card_id"
            value={allDisrupt ? pct(offAll(allDisrupt), allDisrupt.shown) : "–"}
            note={allDisrupt && turnedOff ? `X ${pct(allDisrupt.off_x, allDisrupt.shown)} · 快捷键 ${pct(allDisrupt.off_shortcut, allDisrupt.shown)} · 设置 ${pct(allDisrupt.off_settings, allDisrupt.shown)}` : undefined} />
          <Kpi label="Esc 率" value={escWithId ? pct(allDisrupt?.esc ?? 0, allDisrupt?.shown ?? 0) : pct(q4.legacyEsc.esc, q4.legacyEsc.shown)}
            note={escWithId ? undefined : "暂按事件计（card_dismissed ÷ card_shown），旧版本 Esc 和点 X 不分"} />
          <Kpi label="出卡后切走率" ready={has("ime_deactivated") && has("card_shown", "card_id")} need="ime_deactivated.recent_card_id"
            value={allDisrupt ? pct(allDisrupt.away, allDisrupt.shown) : "–"} />
        </div>
        <h4>关掉以后</h4>
        <div className="kpis">
          <Kpi big label="重新打开前的时长 中位数 / p90（近 30 天的关闭）" ready={turnedOff} need="translation_turned_off、translation_turned_on"
            value={`${minutes(reopenAll?.p50)} / ${minutes(reopenAll?.p90)}`}
            note={reopenAll ? `${reopenAll.offs} 次关闭，${reopenAll.offs - reopenAll.reopened} 次还没重新打开` : undefined} />
          <Kpi big label="从未重新打开的设备占比" ready={turnedOff && daily} need="translation_turned_off、translation_turned_on、input_time_daily"
            value={pct(neverAll?.num ?? 0, neverAll?.den ?? 0)}
            note={neverAll ? `${neverAll.num} / ${neverAll.den} 台（第一次关闭已满 7 天，之后还活跃过）` : undefined} />
          <Kpi label="当前关着翻译的活跃设备" ready={has("input_time_daily", "translate_on")} need="input_time_daily.translate_on"
            value={pct(q4.currentlyOff.translate_off, q4.currentlyOff.translate_n)}
            note={has("input_time_daily", "polish_on") ? `润色：${pct(q4.currentlyOff.polish_off, q4.currentlyOff.polish_n)}` : undefined} />
          <Kpi label="X 关闭率 ≥ 30% 的设备占比" value={pct(q4.xPerDevice.annoyed, q4.xPerDevice.devices)} ready={turnedOff || has("card_closed")} need="translation_turned_off"
            note={`${RL}展示 ≥ 10 张卡的设备；每人中位数 ${pctOf(q4.xPerDevice.p50)}，p90 ${pctOf(q4.xPerDevice.p90)}`} />
        </div>
        <div className="grid">
          <section><h4>重新打开前的时长（按关闭方式）</h4>
            {!turnedOff ? <PendingBlock need="translation_turned_off、translation_turned_on" /> : (
              <table>
                <thead><tr><th scope="col">关闭方式</th><th scope="col">关闭</th><th scope="col">已重新打开</th>
                  <th scope="col">中位数</th><th scope="col">p90</th></tr></thead>
                <tbody>{q4.reopen.filter((r) => r.label !== null).map((r) => (
                  <tr key={r.label}><td>{OFF_SOURCE[r.label as string] ?? r.label}</td><td>{r.offs}</td><td>{r.reopened}</td>
                    <td>{minutes(r.p50)}</td><td>{minutes(r.p90)}</td></tr>
                ))}</tbody>
              </table>
            )}</section>
          <section><h4>从未重新打开（按第一次关闭的类型和方式）</h4>
            {!(turnedOff && daily) ? <PendingBlock need="translation_turned_off、input_time_daily" /> : (
              <table>
                <thead><tr><th scope="col">卡片 · 方式</th><th scope="col">设备</th><th scope="col">从未重开</th></tr></thead>
                <tbody>{q4.neverReopened.filter((r) => r.feature !== null).map((r) => (
                  <tr key={`${r.feature}-${r.source}`}><td>{r.feature === "polish" ? "润色" : "中译英"} · {OFF_SOURCE[r.source ?? ""] ?? r.source}</td>
                    <td>{r.den}</td><td>{pct(r.num, r.den)}</td></tr>
                ))}</tbody>
              </table>
            )}</section>
          <section><h4>按卡片类型和触发方式</h4>
            {!disruptReady ? <PendingBlock need={NEED_DISRUPT} /> : (
              <table>
                <thead><tr><th scope="col">类型 · 触发</th><th scope="col">展示</th><th scope="col">关掉</th><th scope="col">Esc</th>
                  <th scope="col">切走</th><th scope="col">打扰率</th></tr></thead>
                <tbody>{[...typeDisrupt, ...trigDisrupt].map((r) => (
                  <tr key={`${r.type}-${r.trig}`}><td>{r.type === "polish" ? "润色" : "中译英"}{r.trig ? ` · ${r.trig}` : " · 合计"}</td>
                    <td>{r.shown}</td><td>{pct(offAll(r), r.shown)}</td><td>{pct(r.esc, r.shown)}</td>
                    <td>{pct(r.away, r.shown)}</td><td>{pct(offAll(r) + r.esc + r.away, r.shown)}</td></tr>
                ))}</tbody>
              </table>
            )}</section>
          <section><h4>打扰率日趋势（关掉 X / 快捷键 / 设置、Esc、切走）</h4>
            {!disruptReady ? <PendingBlock need={NEED_DISRUPT} /> : (
              <table>
                <thead><tr><th scope="col">日期</th><th scope="col">展示</th><th scope="col">X</th><th scope="col">快捷键</th>
                  <th scope="col">设置</th><th scope="col">Esc</th><th scope="col">切走</th></tr></thead>
                <tbody>{q4.disruptByDay.map((r) => (
                  <tr key={r.label}><td>{r.label}</td><td>{r.shown}</td><td>{pct(r.off_x, r.shown)}</td><td>{pct(r.off_shortcut, r.shown)}</td>
                    <td>{pct(r.off_settings, r.shown)}</td><td>{pct(r.esc, r.shown)}</td><td>{pct(r.away, r.shown)}</td></tr>
                ))}</tbody>
              </table>
            )}</section>
          <section><h4>按键处理耗时（警戒线 p90 = 10 ms）</h4>
            {!has("key_latency") ? <PendingBlock need="key_latency" /> : (
              <table>
                <thead><tr><th scope="col">日期</th><th scope="col">按键</th><th scope="col">p50</th><th scope="col">p90</th><th scope="col">p99</th></tr></thead>
                <tbody>{q4.keyLatency.map((r) => (
                  <tr key={r.label} className={(r.p90 ?? 0) > 10_000 ? "warn" : undefined}><td>{r.label}</td><td>{r.n}</td>
                    <td>{num(r.p50 == null ? null : r.p50 / 1000, 1)} ms</td><td>{num(r.p90 == null ? null : r.p90 / 1000, 1)} ms</td>
                    <td>{num(r.p99 == null ? null : r.p99 / 1000, 1)} ms</td></tr>
                ))}</tbody>
              </table>
            )}
            <p className="note">按小时汇总，按按键数加权平均。</p></section>
          <section><h4>关掉翻译 / 润色的设备（当前状态）</h4>
            <Bars rows={q4.toggledOff} ready={turnedOff || has("translation_toggled")} need="translation_turned_off / translation_turned_on" /></section>
          <section><h4>替换失败（{RL}，失败率 {pct(q4.replaceTotal.failed, q4.replaceTotal.total)}）</h4>
            <Bars rows={q4.replaceFailures} />
            {!has("card_replaced", "app_category") && <p className="note">按应用类别拆分：<Pending need="card_replaced.app_category" /></p>}</section>
          <section><h4>每千打字分钟崩溃次数（按版本，{RL}）</h4>
            {!(has("ime_restarted") && has("input_time_daily", "youdao_typing_min")) ? <PendingBlock need="ime_restarted、input_time_daily.youdao_typing_min" /> : (
              <table>
                <thead><tr><th scope="col">版本</th><th scope="col">崩溃</th><th scope="col">打字分钟</th><th scope="col">每千分钟</th></tr></thead>
                <tbody>{q4.crashes.map((r) => (
                  <tr key={r.label}><td>{r.label}</td><td>{r.crashes}</td><td>{r.mins}</td>
                    <td>{r.mins > 0 ? ((r.crashes / r.mins) * 1000).toFixed(1) : "–"}</td></tr>
                ))}</tbody>
              </table>
            )}</section>
        </div>
      </Question>

      <Question n={5} title="学习提示有没有独立价值" ask="主动的学习互动才算：点生词、点释义、点回顾、加生词本、开小词典、开学习面板、标已认识、复习。只看到高亮不算。">
        <h3>关键指标：学习功能周渗透率</h3>
        <p className="note">
          分子：这一周至少 1 次学习互动的设备；分母：这一周至少 1 天「活跃」（上屏 ≥ 1 次）的设备。自然周，周一 0 点起。
          「活跃」要等 input_time_daily；在那之前另列临时口径：分母用这一周有任何上报的设备。
        </p>
        <div className="kpis">
          <Kpi big label={`周渗透率（${lastWeek?.label ?? ""} 那周）`} value={lastWeek ? pct(lastWeek.act_learn, lastWeek.act) : "–"}
            ready={q5.officialLearning} need="input_time_daily.commits" />
          <Kpi label="临时口径（分母 = 有上报的设备）" value={lastWeek ? pct(lastWeek.seen_learn, lastWeek.seen) : "–"}
            note={lastWeek ? `${lastWeek.seen_learn} / ${lastWeek.seen} 台` : undefined} />
          <Kpi label="有互动设备的互动次数中位数" value={num(q5.learnMedian.p50)} note={q5.officialLearning ? undefined : "临时口径"} />
        </div>
        <div className="grid">
          <section><h4>逐周趋势</h4>
            <table>
              <thead><tr><th scope="col">周（周一）</th><th scope="col">渗透率</th><th scope="col">临时口径</th></tr></thead>
              <tbody>{q5.weeks.map((w) => (
                <tr key={w.label}><td>{w.label}{w.current ? "（本周）" : ""}</td>
                  <td>{q5.officialLearning ? `${pct(w.act_learn, w.act)} (${w.act_learn}/${w.act})` : <Pending need="input_time_daily.commits" />}</td>
                  <td>{pct(w.seen_learn, w.seen)} <small>({w.seen_learn}/{w.seen})</small></td></tr>
              ))}</tbody>
            </table></section>
          <section><h4>每人本周互动次数分档（{lastWeek?.label} 那周{q5.officialLearning ? "" : "，临时口径"}）</h4>
            <Bars rows={q5.learnBuckets} unit=" 台" label={(b) => `${b} 次`} /></section>
          <section><h4>各类互动（{lastWeek?.label} 那周）</h4>
            <table>
              <thead><tr><th scope="col">互动</th><th scope="col">次数</th><th scope="col">占比</th><th scope="col">周渗透率</th></tr></thead>
              <tbody>{q5.learnByType.map((r) => {
                const total = q5.learnByType.reduce((a, x) => a + x.n, 0);
                const pending = NEW_LEARNING.has(r.label) && !has(r.label);
                return (
                  <tr key={r.label}><td>{LEARNING[r.label] ?? r.label}</td>
                    {pending ? <td colSpan={3}><Pending need={r.label} /></td> : <>
                      <td>{r.n}</td><td>{pct(r.n, total)}</td><td>{pct(r.devices, r.base)}</td></>}
                  </tr>
                );
              })}</tbody>
            </table></section>
          <section><h4>按英语水平（周渗透率，柱长 = 设备数）</h4>
            <Bars rows={levelRows(q5.learnByLevel)} unit=" 台" />
            <p className="note">英语水平取批次的 english_level，没有时取最近一次 level_setting。</p></section>
        </div>
        <h3>辅助指标</h3>
        <div className="kpis">
          <Kpi label="「学会」率（高亮后 14 天内自己打出来）" value={pct(q5.learned.typed, q5.learned.highlighted)}
            ready={has("word_first_highlighted") && has("word_typed_back")} need="word_first_highlighted、word_typed_back" />
          <Kpi label={`人均生词本新增（${RL}）`} value={q5.wordBook.devices > 0 ? (q5.wordBook.added / q5.wordBook.devices).toFixed(1) : "–"}
            ready={has("word_added_to_book")} need="word_added_to_book" />
          <Kpi label="复习答「认识」的比例" value={pct(q5.wordBook.known, q5.wordBook.reviewed)} ready={has("word_reviewed")} need="word_reviewed" />
          <Kpi label={`「只学不翻」设备（${RL}）`} value={q5.learnNotTranslate.n} note={`占有上报设备 ${pct(q5.learnNotTranslate.n, q5.learnNotTranslate.den)}`} />
          <Kpi label="「只学不翻」的第 14 天主力留存" value="–" ready={false} need={NEED_DAILY} />
        </div>
      </Question>

      <section id="ops">
        <h2>运行情况</h2>
        <div className="grid">
          <section><h4>版本（30 天内有上报的设备）</h4><Bars rows={s.versions} /></section>
          <section><h4>新公共字段覆盖（近 90 天批次）</h4>
            <table><tbody>
              <tr><td>platform</td><td>{s.meta.platform || <Pending need="批次顶层 platform" />}</td></tr>
              <tr><td>english_level</td><td>{s.meta.english_level || <Pending need="批次顶层 english_level" />}</td></tr>
              <tr><td>install_date</td><td>{s.meta.install_date || <Pending need="批次顶层 install_date" />}</td></tr>
            </tbody></table>
            <p className="note">没有 platform 的旧版本按 os_version 判断（Windows 版发 「windows 10.0.x」）。</p></section>
        </div>
      </section>
    </main>
  );
}
