import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./site.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "有道 AI 输入法 · 像老外一样打字 · 一种神奇的学习方式",
  description: "像老外一样打字：打中文直接出地道英文，闲聊、工作、学术三种说法任选。一种神奇的学习方式：照常打中文，看一眼英文卡片就学到新词。Mac 和 Windows 内测招募中，扫码进群领取内测专属福利。",
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
