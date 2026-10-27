import { listUsers, userCode, type UserRow } from "@/lib/users";
import { PRODUCTS, productParam, type Product } from "@/lib/product";
import { NameForm } from "./NameForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const PLATFORM: Record<string, string> = { mac: "Mac", windows: "Windows" };

export default async function Users({ searchParams }: { searchParams: { q?: string; product?: string } }) {
  const search = (searchParams.q ?? "").slice(0, 64);
  const product = productParam(searchParams.product);
  let rows: UserRow[];
  try {
    rows = await listUsers(product, search);
  } catch (err) {
    console.error(err);
    return <main><h1>读取失败</h1><p className="sub">数据库不可用，检查 DATABASE_URL。</p></main>;
  }
  const href = (p: Product, q = search) => {
    const qs = new URLSearchParams();
    if (p !== "zh") qs.set("product", p);
    if (q) qs.set("q", q);
    const s = qs.toString();
    return `/users${s ? `?${s}` : ""}`;
  };
  const back = href(product);
  return (
    <main>
      <p className="crumbs"><a href={product === "zh" ? "/" : `/?product=${product}`}>← 总览</a></p>
      <h1>用户 · {PRODUCTS[product]}</h1>
      <p className="sub">
        内测设备一台一行，按最后上报时间排序。只有计数和枚举，没有用户打的字。备注名只存在看板这边，用来认人（比如「张三」），客户端看不到。
      </p>
      <nav className="filters" aria-label="产品">
        <span>产品：</span>
        {(Object.keys(PRODUCTS) as Product[]).map((p) => (
          <a key={p} href={href(p, "")} aria-current={product === p}>{PRODUCTS[p]}</a>
        ))}
      </nav>
      <form className="filters" method="get" action="/users" role="search">
        {product !== "zh" && <input type="hidden" name="product" value={product} />}
        <label htmlFor="q">搜索：</label>
        <input id="q" name="q" defaultValue={search} placeholder="用户码（如 0A1B-2C3D 或开头几位）、备注名或设备 ID" size={36} autoComplete="off" />
        <button type="submit">搜索</button>
        {search && <a href={href(product, "")}>清除</a>}
        <small className="note">{rows.length} 台</small>
      </form>
      <p className="note">
        <b>用户码</b> = 设备 ID（匿名 UUID）的前 8 位十六进制，转大写，写成 XXXX-XXXX；客户端之后会在设置里显示同一个码。
        <b>活跃天数</b>：按设备逐天判断，这一天有 input_time_daily 时看上屏 ≥ 1 次，没有时当天有任何上报就算。
        卡片数按 card_id 去重；旧版本不带 card_id 的按事件计。
      </p>
      {rows.length === 0 ? <p className="empty">{search ? "没有匹配的设备" : "暂无数据"}</p> : (
        <div className="scroll">
          <table className="users">
            <thead><tr>
              <th scope="col">用户码</th><th scope="col">备注名</th><th scope="col">平台 · 版本</th><th scope="col">安装日</th>
              <th scope="col">最后上报</th><th scope="col">活跃天数</th>
              <th scope="col" title="中译英卡片：展示 / 采纳（采纳率）">中译英 展示 / 采纳</th>
              <th scope="col" title="看过 ÷ 展示">看过率</th>
              <th scope="col" title="润色建议：展示 / 采纳">润色 展示 / 采纳</th>
              <th scope="col" title="「帮助改进」上传的样本条数（只计数，不显示内容）">样本</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.device_id}>
                <td><a href={`/users/${r.device_id}`} className="code">{userCode(r.device_id)}</a></td>
                <td><NameForm deviceId={r.device_id} name={r.name} back={back} /></td>
                <td>{PLATFORM[r.platform ?? ""] ?? r.platform ?? "?"} · {r.app_version ?? "?"}{r.channel ? <small> {r.channel}</small> : null}</td>
                <td>{r.install_day ?? <span className="muted">–</span>}</td>
                <td title={r.first_seen ? `第一次上报 ${r.first_seen}` : undefined}>{r.last_seen ?? "–"}</td>
                <td title={r.last_active ? `最后活跃 ${r.last_active}` : undefined}>{r.active_days}</td>
                <td>{r.shown} / {r.adopted} <small>({pct(r.adopted, r.shown)})</small></td>
                <td>{pct(r.glanced, r.shown)}</td>
                <td>{r.p_shown} / {r.p_accepted}</td>
                <td>{r.samples}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
