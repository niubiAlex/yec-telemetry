import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./site.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "有道 AI 输入法 · 像老外一样打字 · 内测招募",
  description: "打中文，也能聊英文。输入中文时就能看到地道的英文表达，闲聊、工作、学术三种说法任选。Mac 和 Windows 内测招募中，参与内测赠送有道词典 SVIP。",
  robots: { index: false, follow: false },
  icons: { icon: "/home/icon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e8ebe6" };

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
