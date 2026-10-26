import type { ReactNode } from "react";

export const metadata = { title: "有道输入 · Beta 指标", robots: { index: false } };

const css = `
:root { color-scheme: light dark; --ink:#1f2328; --muted:#656d76; --line:#d0d7de; --bar:#0969da; --bg:#fff; --card:#f6f8fa; --pend:#9a6700; --pendbg:#fff8c5; }
@media (prefers-color-scheme: dark) { :root { --ink:#e6edf3; --muted:#9198a1; --line:#3d444d; --bar:#4493f8; --bg:#0d1117; --card:#151b23; --pend:#d29922; --pendbg:#2d2410; } }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: var(--ink); background: var(--bg); }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 32px 0 8px; }
.sub { color: var(--muted); margin: 0 0 16px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.kpi { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.kpi b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
.kpi span { color: var(--muted); font-size: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 0 24px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 500; font-size: 12px; }
td.bar { width: 40%; }
td.bar i { display: block; height: 8px; border-radius: 4px; background: var(--bar); min-width: 1px; }
.empty { color: var(--muted); }
.note { color: var(--muted); font-size: 12px; margin-top: 4px; }
h3 { font-size: 14px; margin: 20px 0 8px; }
h4 { font-size: 13px; margin: 16px 0 6px; font-weight: 600; }
.question { border-top: 2px solid var(--line); margin-top: 36px; padding-top: 4px; }
.question h2 { font-size: 17px; }
.qn { display: inline-block; background: var(--bar); color: #fff; border-radius: 4px; padding: 0 6px; margin-right: 8px; font-size: 13px; }
.kpis { margin-bottom: 8px; }
.kpis.four { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
@media (min-width: 900px) { .kpis.four { grid-template-columns: repeat(4, 1fr); } }
.kpi.key { border-color: var(--bar); border-width: 2px; }
.kpi small { display: block; color: var(--muted); font-size: 11px; margin-top: 2px; }
.pending { display: inline-block; font-size: 12px; font-weight: 500; color: var(--pend); background: var(--pendbg); border: 1px dashed var(--pend); border-radius: 4px; padding: 0 6px; white-space: nowrap; }
.kpi b .pending { font-size: 13px; }
.filters, .toc { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin: 8px 0 12px; font-size: 13px; }
.filters a, .toc a { color: var(--bar); text-decoration: none; padding: 1px 8px; border: 1px solid var(--line); border-radius: 12px; }
.filters a[aria-current="true"] { background: var(--bar); color: #fff; border-color: var(--bar); }
.filters .sep { margin-left: 12px; }
.muted { color: var(--muted); }
td small { color: var(--muted); }
tr.warn td { color: #cf222e; }
.curve { width: 100%; max-width: 480px; height: auto; }
.curve text { font-size: 10px; fill: var(--muted); }
.curve .grid { stroke: var(--line); }
.curve polyline { fill: none; stroke-width: 2.5; }
.curve .l-active, .k-active { stroke: var(--bar); color: var(--bar); }
.curve .l-main, .k-main { stroke: #bf3989; color: #bf3989; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head><style dangerouslySetInnerHTML={{ __html: css }} /></head>
      <body>{children}</body>
    </html>
  );
}
