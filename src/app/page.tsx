import { loadStats, type Count } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TONE: Record<string, string> = { chat: "闲聊", work: "工作", academic: "学术", "?": "未知" };
const METHOD: Record<string, string> = {
  click: "点击", right_option: "右 Option", ctrl_return: "Ctrl+Return", tab: "Tab（旧版）",
};
const LEARNING: Record<string, string> = {
  gloss_shown: "词义行展示", dict_opened: "打开词典", new_word_shown: "生词展示", new_word_clicked: "生词点击",
  recall_shown: "复习提示展示", recall_clicked: "复习提示点击", tone_switched: "切换语气",
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const ms = (v: number | null) => (v == null ? "–" : `${v} ms`);

function Bars({ rows, label = (s: string) => s, unit = "" }: { rows: Count[]; label?: (s: string) => string; unit?: string }) {
  if (rows.length === 0) return <p className="empty">暂无数据</p>;
  const max = Math.max(...rows.map((r) => r.n));
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

export default async function Page() {
  let s;
  try {
    s = await loadStats();
  } catch (err) {
    console.error(err);
    return <main><h1>读取失败</h1><p className="sub">数据库不可用，检查 DATABASE_URL。</p></main>;
  }
  const o = s.overview;
  const learn = Object.fromEntries(s.learning.map((r) => [r.label, r.n]));
  const totalShown = s.tones.reduce((a, t) => a + t.shown, 0);
  const totalReplaced = s.tones.reduce((a, t) => a + t.replaced, 0);

  return (
    <main>
      <h1>有道英文 Copilot 输入法 · 使用统计</h1>
      <p className="sub">匿名统计，只有计数、枚举和错误码，没有输入内容。日期按北京时间。</p>

      <section className="kpis" aria-label="概览">
        <div className="kpi"><b>{o.devices}</b><span>设备总数</span></div>
        <div className="kpi"><b>{o.installs}</b><span>安装</span></div>
        <div className="kpi"><b>{o.active1}</b><span>今日活跃</span></div>
        <div className="kpi"><b>{o.active7}</b><span>7 日活跃</span></div>
        <div className="kpi"><b>{o.active30}</b><span>30 日活跃</span></div>
        <div className="kpi"><b>{pct(totalReplaced, totalShown)}</b><span>7 日卡片采纳率</span></div>
      </section>

      <h2>近 30 天</h2>
      <table>
        <thead>
          <tr><th scope="col">日期</th><th scope="col">活跃设备</th><th scope="col">安装</th><th scope="col">卡片展示</th>
            <th scope="col">替换</th><th scope="col">采纳率</th><th scope="col">跳过/Esc</th><th scope="col">词义行</th><th scope="col">整句 P50</th></tr>
        </thead>
        <tbody>
          {s.days.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td><td>{d.active}</td><td>{d.installs}</td><td>{d.shown}</td><td>{d.replaced}</td>
              <td>{pct(d.replaced, d.shown)}</td><td>{d.dismissed}</td><td>{d.gloss}</td><td>{ms(d.p50)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>卡片漏斗（7 天，按语气）</h2>
      {s.tones.length === 0 ? <p className="empty">暂无数据</p> : (
        <table>
          <thead>
            <tr><th scope="col">语气</th><th scope="col">展示</th><th scope="col">替换成功</th><th scope="col">采纳率</th>
              <th scope="col">替换失败</th><th scope="col">跳过/Esc</th><th scope="col">替换后撤销</th></tr>
          </thead>
          <tbody>
            {s.tones.map((t) => (
              <tr key={t.tone}>
                <td>{TONE[t.tone] ?? t.tone}</td><td>{t.shown}</td><td>{t.replaced}</td><td>{pct(t.replaced, t.shown)}</td>
                <td>{t.failed}</td><td>{t.dismissed}</td><td>{t.undone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="note">替换按卡片当时的语气计。「跳过/Esc」包括按 Esc 和继续打字让卡片作废。</p>

      <div className="grid">
        <section><h2>替换方式（7 天）</h2><Bars rows={s.methods} label={(m) => METHOD[m] ?? m} /></section>
        <section><h2>替换失败原因（7 天）</h2><Bars rows={s.failures} /></section>
      </div>

      <h2>整句翻译延迟（7 天）</h2>
      <table>
        <thead><tr><th scope="col">请求</th><th scope="col">失败</th><th scope="col">失败率</th><th scope="col">P50</th><th scope="col">P90</th><th scope="col">P95</th></tr></thead>
        <tbody>
          <tr><td>{s.latency.n}</td><td>{s.latency.errors}</td><td>{pct(s.latency.errors, s.latency.n)}</td>
            <td>{ms(s.latency.p50)}</td><td>{ms(s.latency.p90)}</td><td>{ms(s.latency.p95)}</td></tr>
        </tbody>
      </table>
      {s.errorCodes.length > 0 && <><h2>失败错误码（7 天）</h2><Bars rows={s.errorCodes} /></>}

      <div className="grid">
        <section>
          <h2>学习功能（7 天）</h2>
          <Bars rows={s.learning} label={(k) => LEARNING[k] ?? k} />
          <p className="note">
            生词点击率 {pct(learn.new_word_clicked ?? 0, learn.new_word_shown ?? 0)} ·
            复习提示点击率 {pct(learn.recall_clicked ?? 0, learn.recall_shown ?? 0)}
          </p>
        </section>
        <section><h2>候选词选第几个（7 天）</h2><Bars rows={s.candidates} label={(i) => `第 ${i === "9+" ? "10+" : Number(i) + 1} 个`} /></section>
      </div>

      <h2>常用 App（7 天）</h2>
      {s.apps.length === 0 ? <p className="empty">暂无数据</p> : (
        <table>
          <thead><tr><th scope="col">App</th><th scope="col">Bundle ID</th><th scope="col">设备</th><th scope="col">次数</th></tr></thead>
          <tbody>
            {s.apps.map((a) => (
              <tr key={a.bundle_id}><td>{a.app_name ?? "–"}</td><td>{a.bundle_id}</td><td>{a.devices}</td><td>{a.n}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid">
        <section><h2>版本（30 天活跃设备）</h2><Bars rows={s.versions} /></section>
        <section><h2>水平设置（每台设备最新值）</h2><Bars rows={s.levels} /></section>
      </div>
      <h2>改过的设置（30 天）</h2>
      <Bars rows={s.settings} />
    </main>
  );
}
