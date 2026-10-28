"use client";

import { useState, type KeyboardEvent } from "react";
import { TONES } from "./content";

/** The translation card, as the IME draws it: one sentence, three tones. Ctrl T cycles them, as in the app. */
export function HeroCard() {
  const [tone, setTone] = useState(0);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      setTone((t) => (t + 1) % TONES.length);
    }
  };
  return (
    <div className="demo" tabIndex={0} onKeyDown={onKey} aria-label="翻译卡片演示：按 Ctrl T 或点语气切换">
      <div className="demohead">
        <span>在任何应用里打中文</span>
        <span>演示</span>
      </div>
      <div className="field" aria-hidden="true">我们改到下周吧<span className="caret" /></div>
      <p className="pinyin">women gaidao xiazhou ba · 空格上屏</p>
      <div className="card">
        <div className="cardhead">
          <span className="cardlogo" aria-hidden="true">有</span>
          <span className="en">English</span>
          {TONES.map((t, i) => (
            <button key={t.id} type="button" className="tone" aria-pressed={i === tone} onClick={() => setTone(i)}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="out en" aria-live="polite">{TONES[tone].text}</p>
        <div className="cardfoot">
          <span><kbd>Ctrl J</kbd> 使用</span>
          <span><kbd>Ctrl T</kbd> 换语气</span>
          <span><kbd>Esc</kbd> 关掉</span>
        </div>
      </div>
      <p className="demotip">点语气，或点一下卡片区域再按 Ctrl T 试试。</p>
    </div>
  );
}
