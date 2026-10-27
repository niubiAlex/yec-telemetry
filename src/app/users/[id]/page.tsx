import { notFound } from "next/navigation";
import { isDeviceId, userCode, userDetail, type DayRow } from "@/lib/users";
import { How } from "../../How";
import { ADOPT_HOW, DISRUPT_HOW, POLISH_ADOPT_HOW } from "../../explain";
import { PRODUCTS } from "@/lib/product";
import { NameForm } from "../NameForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RANGES = [14, 30, 90] as const;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const n0 = (v: number | null | undefined) => (v == null ? <span className="muted">–</span> : v === 0 ? <span className="muted">0</span> : v);
const PLATFORM: Record<string, string> = { mac: "Mac", windows: "Windows" };
const APP: Record<string, string> = { chat: "聊天", mail: "邮件", doc: "文档", code: "写代码", other: "其他" };
const SAMPLE: Record<string, string> = { zh_en: "中译英", polish: "润色", survey: "第 7 天问卷" };
const LEVEL: Record<string, string> = { unset: "未设置" };
const yesNo = (v: boolean | null | undefined, yes = "是", no = "否") => (v == null ? "–" : v ? yes : no);

export default async function UserDetail({ params, searchParams }: {
  params: { id: string }; searchParams: { range?: string; day?: string };
}) {
  if (!isDeviceId(params.id)) notFound();
  const id = params.id.toLowerCase();
  const range = RANGES.find((r) => String(r) === searchParams.range) ?? 30;
  const eventDay = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? (searchParams.day as string) : null;
  let d: Awaited<ReturnType<typeof userDetail>>;
  try {
    d = await userDetail(id, range, eventDay);
  } catch (err) {
    console.error(err);
    return <main><h1>读取失败</h1><p className="sub">数据库不可用，检查 DATABASE_URL。</p></main>;
  }
  if (!d) notFound();
  const p = d.profile;
  const self = (o: { range?: number; day?: string | null } = {}) => {
    const qs = new URLSearchParams();
    const r = o.range ?? range;
    if (r !== 30) qs.set("range", String(r));
    const day = o.day === undefined ? eventDay : o.day;
    if (day) qs.set("day", day);
    const s = qs.toString();
    return `/users/${id}${s ? `?${s}` : ""}`;
  };
  const sum = (f: (r: DayRow) => number) => d!.days.reduce((a, r) => a + f(r), 0);
  const tot = {
    shown: sum((r) => r.shown), glanced: sum((r) => r.glanced), adopted: sum((r) => r.adopted),
    dis: sum((r) => r.esc + r.closed + r.away), p_shown: sum((r) => r.p_shown), p_accepted: sum((r) => r.p_accepted),
    active: d.days.filter((r) => r.active).length,
  };

  return (
    <main>
      <p className="crumbs">
        <a href={p.product === "zh" ? "/" : `/?product=${p.product}`}>← 总览</a> ·{" "}
        <a href={p.product === "zh" ? "/users" : `/users?product=${p.product}`}>用户 · {PRODUCTS[p.product]}</a>
      </p>
      <h1><span className="code">{userCode(id)}</span> {p.name && <span>{p.name}</span>}</h1>
      <p className="sub">{PRODUCTS[p.product]}，设备 ID {id}。只有计数、枚举和应用标识，没有用户打的字；「帮助改进」样本只显示条数。</p>
      <NameForm deviceId={id} name={p.name} back={self()} />

      <div className="kpis">
        <div className="kpi"><b>{PLATFORM[p.platform ?? ""] ?? p.platform ?? "?"} {p.app_version}</b>
          <span>平台 · 版本</span><small>{p.os_version}{p.channel ? ` · ${p.channel}` : ""}</small></div>
        <div className="kpi"><b>{p.install_day ?? "–"}</b><span>安装日</span><small>第一次上报 {p.first_seen ?? "–"}</small></div>
        <div className="kpi"><b>{p.last_seen ?? "–"}</b><span>最后上报</span><small>最后活跃 {p.last_active ?? "–"}</small></div>
        <div className="kpi"><b>{p.active_days}</b><span>活跃天数（全部）</span><small>近 {range} 天 {tot.active} 天</small></div>
        <div className="kpi"><b>{pct(tot.adopted, tot.shown)}</b><span>中译英采纳率（近 {range} 天）</span><How>{ADOPT_HOW}</How>
          <small>{tot.adopted} / {tot.shown} · 看过率 {pct(tot.glanced, tot.shown)}</small></div>
        <div className="kpi"><b>{pct(tot.dis, tot.shown)}</b><span>中译英打扰率（近 {range} 天）</span>
          <How right>{DISRUPT_HOW}</How><small>{tot.dis} / {tot.shown} 张（关掉 + Esc + 切走）</small></div>
        <div className="kpi"><b>{pct(tot.p_accepted, tot.p_shown)}</b><span>润色采纳率（近 {range} 天）</span>
          <How right>{POLISH_ADOPT_HOW}</How><small>{tot.p_accepted} / {tot.p_shown}</small></div>
        <div className="kpi"><b>{LEVEL[p.english_level ?? ""] ?? p.english_level ?? "–"}</b><span>英语水平</span>
          <small>引导完成 {yesNo(p.onboarded)} · 帮助改进 {yesNo(p.improve_on, "开", "关")}</small></div>
      </div>

      <h3>留存状态（相对安装日）</h3>
      {d.retention.length === 0 ? <p className="empty">没有安装日（没有 install_date、install 或 input_source_added）</p> : (
        <table className="narrow">
          <thead><tr><th scope="col">时间窗</th><th scope="col">活跃</th><th scope="col">主力</th></tr></thead>
          <tbody>{d.retention.map((r) => (
            <tr key={r.k}><td>第 {r.k} 天{r.hi > r.lo ? <small>（第 {r.lo}–{r.hi} 天任意一天）</small> : null}</td>
              {r.done ? <><td>{r.active ? "✓" : "✗"}</td><td>{r.main ? "✓" : "✗"}</td></>
                : <td colSpan={2} className="muted">要等 {r.due} 才有数{r.active ? "（已活跃 ✓）" : ""}</td>}</tr>
          ))}</tbody>
        </table>
      )}
      <p className="note">活跃 = 那天上屏 ≥ 1 次（那天没有 input_time_daily 时，有任何上报就算）；主力 = 那天上屏 ≥ 200 字且「切走不回」≤ 1 次。</p>

      <h3>逐日</h3>
      <nav className="filters" aria-label="范围">
        <span>范围：</span>
        {RANGES.map((r) => <a key={r} href={self({ range: r })} aria-current={range === r}>近 {r} 天</a>)}
      </nav>
      <p className="note">
        卡片和润色按展示的那一天算；Esc / 关掉 / 切走按卡片计，一张卡只算最先发生的那种（同打扰率）。「活跃」后面带 * 的是那天没有 input_time_daily、按有上报算的。
        上屏、英文、打字分钟、切走不回来自 input_time_daily；首选命中率来自 typing_stats。点日期看那天的原始事件。
      </p>
      <div className="scroll">
        <table className="timeline">
          <thead>
            <tr><th scope="col" rowSpan={2}>日期</th><th scope="colgroup" colSpan={2}>状态</th><th scope="colgroup" colSpan={5}>打字</th>
              <th scope="colgroup" colSpan={7}>中译英卡片</th><th scope="colgroup" colSpan={3}>润色</th>
              <th scope="colgroup" colSpan={2}>开关</th><th scope="col" rowSpan={2}>学习</th>
              <th scope="colgroup" colSpan={3}>出卡</th><th scope="col" rowSpan={2}>崩溃</th><th scope="col" rowSpan={2}>事件</th></tr>
            <tr><th scope="col">活跃</th><th scope="col">主力</th>
              <th scope="col">上屏次数</th><th scope="col">上屏字数</th><th scope="col">英文</th><th scope="col">打字分钟</th><th scope="col">首选命中</th>
              <th scope="col">展示</th><th scope="col">看过</th><th scope="col">采纳</th><th scope="col">撤销</th>
              <th scope="col">Esc</th><th scope="col">关掉</th><th scope="col">切走</th>
              <th scope="col">展示</th><th scope="col">采纳</th><th scope="col" title="Esc / 关掉">Esc·关</th>
              <th scope="col" title="关掉翻译或润色的次数（含快捷键和设置）">关</th><th scope="col">开</th>
              <th scope="col">请求</th><th scope="col">失败</th><th scope="col">p50</th></tr>
          </thead>
          <tbody>{d.days.map((r) => (
            <tr key={r.day} className={r.day === eventDay ? "sel" : r.reports === 0 ? "quiet" : undefined}>
              <td><a href={self({ day: r.day })}>{r.day.slice(5)}</a></td>
              <td title={r.active_fb ? "那天没有 input_time_daily，按有上报算" : undefined}>{r.active ? (r.active_fb ? "✓*" : "✓") : <span className="muted">–</span>}</td>
              <td>{r.main == null ? <span className="muted">–</span> : r.main ? "✓" : "✗"}</td>
              <td>{n0(r.commits)}</td><td>{n0(r.chars)}</td>
              <td title={r.en_card != null ? `卡片替换进去的英文另计 ${r.en_card}` : undefined}>{n0(r.en_typed)}</td>
              <td>{n0(r.typing_min)}</td>
              <td title={r.ts_commits ? `${r.ts_first_hit} / ${r.ts_commits}` : undefined}>{r.ts_commits ? pct(r.ts_first_hit, r.ts_commits) : <span className="muted">–</span>}</td>
              <td>{n0(r.shown)}</td><td>{n0(r.glanced)}</td><td>{n0(r.adopted)}</td><td>{n0(r.undone)}</td>
              <td>{n0(r.esc)}</td><td>{n0(r.closed)}</td><td>{n0(r.away)}</td>
              <td>{n0(r.p_shown)}</td><td>{n0(r.p_accepted)}</td><td>{n0(r.p_esc + r.p_closed)}</td>
              <td>{n0(r.offs)}</td><td>{n0(r.ons)}</td><td>{n0(r.learn)}</td>
              <td>{n0(r.lat_n)}</td><td title={r.p_lat_err ? `润色失败 ${r.p_lat_err}` : undefined}>{n0(r.lat_err)}</td>
              <td>{r.lat_p50 == null ? <span className="muted">–</span> : `${r.lat_p50} ms`}</td>
              <td>{n0(r.crashes)}</td><td>{n0(r.reports)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="grid">
        <section><h4>按应用（近 {range} 天）</h4>
          {d.apps.length === 0 ? <p className="empty">暂无带应用标识的事件（Mac 0.2.x 只发应用类别）</p> : (
            <table>
              <thead><tr><th scope="col">应用</th><th scope="col">用过天数</th><th scope="col">上屏次数</th><th scope="col">字数</th>
                <th scope="col">英文</th><th scope="col">首选命中</th><th scope="col">卡片展示 / 采纳</th><th scope="col">关掉</th></tr></thead>
              <tbody>{d.apps.map((a) => (
                <tr key={a.app}><td>{a.name ?? a.app} {a.name && <small>{a.app}</small>}{a.category && <small> · {APP[a.category] ?? a.category}</small>}</td>
                  <td>{a.days_used}</td><td>{a.commits}</td><td>{a.chars}</td><td>{a.en_chars}</td>
                  <td>{pct(a.first_hit, a.commits)}</td><td>{a.shown} / {a.adopted}</td><td>{a.offs}</td></tr>
              ))}</tbody>
            </table>
          )}
          <p className="note">应用 = Mac 的 bundle id 或 Windows 的 exe 文件名；名字来自 app_used。只有应用标识，没有窗口标题或网址。</p></section>
        <section><h4>「帮助改进」样本（只计数）</h4>
          {d.samples.length === 0 ? <p className="empty">没有样本</p> : (
            <table>
              <thead><tr><th scope="col">类型</th><th scope="col">条数</th><th scope="col">👍</th><th scope="col">👎</th><th scope="col">最近</th></tr></thead>
              <tbody>{d.samples.map((s) => (
                <tr key={s.kind}><td>{SAMPLE[s.kind] ?? s.kind}</td><td>{s.n}</td><td>{s.up}</td><td>{s.down}</td><td>{s.last}</td></tr>
              ))}</tbody>
            </table>
          )}</section>
      </div>

      {eventDay && (
        <section id="events">
          <h3>{eventDay} 的原始事件（北京时间，最多 1000 条） <a className="more" href={self({ day: null })}>收起</a></h3>
          <p className="note">每个事件只保留允许列表里的字段：枚举、计数、开关、应用标识和卡片 ID，没有文字。</p>
          {d.events.length === 0 ? <p className="empty">那天没有事件</p> : (
            <table className="events">
              <thead><tr><th scope="col">时间</th><th scope="col">事件</th><th scope="col">字段</th></tr></thead>
              <tbody>{d.events.map((e, i) => (
                <tr key={i}><td>{e.time}</td><td>{e.name}</td>
                  <td><code>{Object.entries(e.props).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join("  ")}</code></td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
