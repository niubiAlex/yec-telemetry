import type { ReactNode } from "react";

export const metadata = { title: "有道英文 Copilot 输入法 · 使用统计", robots: { index: false } };

const css = `
:root { color-scheme: light dark; --ink:#1f2328; --muted:#656d76; --line:#d0d7de; --bar:#0969da; --bg:#fff; --card:#f6f8fa; }
@media (prefers-color-scheme: dark) { :root { --ink:#e6edf3; --muted:#9198a1; --line:#3d444d; --bar:#4493f8; --bg:#0d1117; --card:#151b23; } }
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
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head><style dangerouslySetInnerHTML={{ __html: css }} /></head>
      <body>{children}</body>
    </html>
  );
}
