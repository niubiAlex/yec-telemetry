import type { ReactNode } from "react";

export const metadata = { title: "有道输入 · Beta 指标", robots: { index: false } };

const css = `
:root { color-scheme: light dark; --ink:#1f2328; --muted:#656d76; --line:#d0d7de; --bar:#0969da; --bg:#fff; --card:#f6f8fa; --pend:#9a6700; --pendbg:#fff8c5; }
@media (prefers-color-scheme: dark) { :root { --ink:#e6edf3; --muted:#9198a1; --line:#3d444d; --bar:#4493f8; --bg:#0d1117; --card:#151b23; --pend:#d29922; --pendbg:#2d2410; } }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: var(--ink); background: var(--bg); }
main { max-width: 1200px; margin: 0 auto; padding: 16px 16px 64px; }
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
.curve.wide { max-width: 960px; }
.overview { margin: 4px 0 8px; }
.counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
.count { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.count span { color: var(--muted); font-size: 12px; width: 100%; }
.count b { font-size: 20px; font-variant-numeric: tabular-nums; }
.tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
@media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, 1fr); } .counts { grid-template-columns: repeat(2, 1fr); } }
.tile { display: block; color: inherit; text-decoration: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.tile:hover, .tile:focus-visible { border-color: var(--bar); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--bar) 30%, transparent); }
.tile h2 { font-size: 13px; margin: 0 0 4px; }
.tile .qn { font-size: 11px; margin-right: 6px; }
.tm { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 6px; padding: 3px 0; border-top: 1px dashed var(--line); }
.tm:first-of-type { border-top: 0; }
.tm .tl { grid-column: 1 / -1; color: var(--muted); font-size: 11px; }
.tm b { font-size: 20px; font-variant-numeric: tabular-nums; }
.tm .pending { grid-column: 1 / -1; justify-self: start; }
.tm .delta { grid-column: 1 / -1; }
.delta { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.delta.up { color: #1a7f37; }
.delta.down { color: #cf222e; }
.delta.muted { opacity: .6; font-style: italic; }
.tile, .count, .bc { position: relative; }
.tile > summary, .count > summary, .bc > summary { list-style: none; cursor: pointer; }
.tile > summary::-webkit-details-marker, .count > summary::-webkit-details-marker, .bc > summary::-webkit-details-marker { display: none; }
.count > summary { display: flex; flex-direction: column; gap: 2px; }
.count .tl { color: var(--muted); font-size: 12px; }
.count[open], .bc[open] { border-color: var(--bar); }
.dv { display: flex; align-items: flex-end; gap: 6px; min-width: 0; }
.dv b { white-space: nowrap; }
.bars { flex: 1; min-width: 40px; max-width: 120px; height: 18px; }
.bars rect { fill: color-mix(in srgb, var(--bar) 35%, transparent); }
.bars rect.hit { fill: transparent; }
.bars rect.sel { fill: var(--bar); }
.bars g:hover rect:not(.hit) { fill: #bf3989; }
.dt { position: absolute; z-index: 10; top: 100%; left: 0; margin-top: 4px; background: var(--card); border: 1px solid var(--bar);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.15); max-height: 360px; overflow: auto; padding: 4px; min-width: 100%; }
.dt.right { left: auto; right: 0; }
.dt table { font-size: 12px; }
tr.sel td { background: color-mix(in srgb, var(--bar) 12%, transparent); font-weight: 600; }
.more { float: right; font-size: 11px; font-weight: 400; color: var(--bar); text-decoration: none; }
form.filters select, form.filters button { font: inherit; font-size: 13px; }
.filters small.note { margin: 0 0 0 8px; }
.basics { margin-top: 8px; }
.basics h2 { font-size: 13px; margin: 0 0 4px; }
.basics h2 small { color: var(--muted); font-weight: 400; font-size: 11px; margin-left: 6px; }
.bgrid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
@media (max-width: 1100px) { .bgrid { grid-template-columns: repeat(4, 1fr); } }
.bc { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px; min-width: 0; cursor: help; }
.bc .tl { display: block; color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc .dv b { font-size: 15px; font-variant-numeric: tabular-nums; line-height: 1.3; }
.dv b small { font-size: 11px; color: #1a7f37; }
.bc .delta { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc .pending { margin: 4px 0 2px; }
.how { position: relative; display: inline-block; margin-left: 4px; }
.how button { font: inherit; font-size: 11px; color: var(--bar); background: none; border: 0; padding: 0; cursor: pointer; }
.how .pop { display: none; position: absolute; z-index: 20; top: 100%; left: 0; margin-top: 4px; width: 300px; max-width: 80vw;
  background: var(--bg); color: var(--ink); border: 1px solid var(--bar); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.15);
  padding: 8px 10px; font-size: 12px; font-weight: 400; line-height: 1.5; text-align: left; white-space: normal; cursor: auto; }
.how.right .pop { left: auto; right: 0; }
.how:hover .pop, .how:focus-within .pop, .how.open .pop { display: block; }
.how .pop ul { margin: 0; padding-left: 16px; }
.how .pop li + li { margin-top: 2px; }
.crumbs { margin: 0 0 4px; font-size: 13px; }
.crumbs a, a.code { color: var(--bar); text-decoration: none; }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .5px; }
.scroll { overflow-x: auto; }
table.narrow { width: auto; }
tr.quiet td { opacity: .45; }
table.timeline th, table.timeline td { padding: 3px 6px; font-size: 12px; }
table.timeline thead tr:first-child th { text-align: center; border-bottom: 0; }
table.events td:last-child { text-align: left; white-space: normal; font-size: 12px; }
.nameform { display: inline-flex; gap: 4px; margin: 0; }
.nameform input { font: inherit; font-size: 13px; width: 9em; padding: 1px 4px; }
.nameform button, form.filters input { font: inherit; font-size: 13px; }
.hint { display: block; color: var(--muted); font-size: 11px; }
.tm .hint { grid-column: 1 / -1; }

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
