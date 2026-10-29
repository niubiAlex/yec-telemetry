"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MAX_INPUT, PRESETS, preset, type TryReply } from "@/lib/try/presets";
import { TONE_KEYS, type Result, type ToneKey } from "@/lib/try/prompt";
import { PER_DAY, PRODUCT, TONE_LABEL, TRY_EVENT } from "./content";
import { track } from "./Track";

type Card =
  | { status: "idle" }
  | { status: "loading"; forText: string }
  | { status: "ready"; forText: string; example: boolean; result: Result }
  | { status: "limited" | "error" | "empty" | "not_chinese"; forText: string };

const PAUSE_MS = 700;
const hanCount = (s: string) => (s.match(/[\u4e00-\u9fff]/g) ?? []).length;

function marked(text: string, word: string | undefined): ReactNode {
  if (!word) return text;
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + word.length)}</mark>{text.slice(i + word.length)}</>;
}

/**
 * The hero's try-it box: type Chinese with your own input method, pause, and
 * the English card appears as in the IME. Nothing is sent while a composition
 * is open (pinyin still being typed): the pause timer is cleared on
 * compositionstart and only armed again by compositionend or by input outside
 * a composition. Chrome/Edge send the last input before compositionend, Safari
 * after it; both paths arm the same timer.
 */
export function TryBox() {
  const [text, setText] = useState("");
  const [tone, setTone] = useState<ToneKey>("chat");
  const [card, setCard] = useState<Card>({ status: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const req = useRef(0);
  const cache = useRef(new Map<string, Card>());
  const shownPresets = useRef(new Set<string>());

  const run = async (s: string) => {
    const hit = cache.current.get(s);
    if (hit) { setCard(hit); return; }
    const n = ++req.current;
    setCard({ status: "loading", forText: s });
    let next: Card;
    try {
      const r = await fetch("/api/try", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: s, tone }),
      });
      const body = (await r.json()) as TryReply;
      if (r.ok && body.result && (body.source === "model" || body.source === "example")) {
        next = { status: "ready", forText: s, example: body.source === "example", result: body.result };
        cache.current.set(s, next);
      } else {
        const st = r.ok && (body.source === "limited" || body.source === "empty" || body.source === "not_chinese") ? body.source : "error";
        next = { status: st, forText: s };
      }
    } catch {
      next = { status: "error", forText: s };
    }
    if (n === req.current) setCard(next);
  };

  const schedule = (value: string) => {
    clearTimeout(timer.current);
    const s = value.trim();
    if (!s) { req.current++; setCard({ status: "idle" }); return; }
    const p = preset(s);
    if (p) {
      req.current++;
      setCard({ status: "ready", forText: s, example: true, result: p.result });
      // Examples are answered here, so /api/try never counts them.
      if (!shownPresets.current.has(s)) { shownPresets.current.add(s); track("try", { source: "example" }); }
      return;
    }
    if (hanCount(s) < 2) return;
    timer.current = setTimeout(() => { if (!composing.current) void run(s); }, PAUSE_MS);
  };

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  const fillWith = (s: string) => {
    clearTimeout(timer.current);
    composing.current = false;
    setText(s);
    schedule(s);
    ta.current?.focus({ preventScroll: true });
  };

  const fillRef = useRef(fillWith);
  fillRef.current = fillWith;
  useEffect(() => {
    const onTry = (e: Event) => {
      const s = (e as CustomEvent<string>).detail;
      if (typeof s !== "string") return;
      fillRef.current(s);
      ta.current?.closest(".demo")?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(TRY_EVENT, onTry);
    return () => { window.removeEventListener(TRY_EVENT, onTry); clearTimeout(timer.current); clearTimeout(toastTimer.current); };
  }, []);

  const ready = card.status === "ready" ? card : null;
  const shown = ready ? ready.result.tones[tone] : "";

  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(shown);
      flash("已复制");
    } catch {
      flash("浏览器没让复制，请手动选中");
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && !e.metaKey && !e.altKey && k === "t") {
      e.preventDefault();
      setTone((t) => TONE_KEYS[(TONE_KEYS.indexOf(t) + 1) % TONE_KEYS.length]);
    } else if (e.ctrlKey && !e.metaKey && !e.altKey && k === "j") {
      e.preventDefault();
      void copy();
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearTimeout(timer.current);
      req.current++;
      setText("");
      setCard({ status: "idle" });
    }
  };

  const stale = card.status !== "idle" && card.forText !== text.trim();

  return (
    <div className="demo" onKeyDown={onKeyDown}>
      <div className="demohead">
        <label htmlFor="try-text">在任何应用里打中文 · 在这里试试</label>
        <span>用你自己的输入法</span>
      </div>
      <textarea
        id="try-text" ref={ta} className="field" rows={2} value={text} maxLength={MAX_INPUT}
        placeholder="打一句中文，停一下，比如：我们改到下周吧"
        spellCheck={false} autoComplete="off"
        onCompositionStart={() => { composing.current = true; clearTimeout(timer.current); }}
        onCompositionEnd={(e) => { composing.current = false; schedule(e.currentTarget.value); }}
        onChange={(e) => {
          setText(e.target.value);
          if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) schedule(e.target.value);
        }}
      />
      <div className="presets">
        <span>没装好输入法？点例句：</span>
        {PRESETS.slice(0, 4).map((p) => (
          <button key={p.text} type="button" className="chip" onClick={() => fillWith(p.text)}>{p.text}</button>
        ))}
      </div>

      <div className={`card${stale ? " stale" : ""}`} aria-live="polite">
        <div className="cardhead">
          <span className="cardlogo" aria-hidden="true">K</span>
          <span className="en">English</span>
          {TONE_KEYS.map((t) => (
            <button key={t} type="button" className="tone" aria-pressed={t === tone} onClick={() => setTone(t)}>
              {TONE_LABEL[t]}
            </button>
          ))}
          {ready && <span className="badge">{ready.example ? "示例" : "实时生成"}</span>}
        </div>
        {card.status === "idle" && <p className="out wait">停顿一下，英文就出现在这里。</p>}
        {card.status === "loading" && <p className="out wait shimmer">正在写英文…</p>}
        {ready && <p className="out en">{marked(shown, ready.result.words[tone]?.word)}</p>}
        {ready && ready.result.words[tone] && (
          <p className="newword">
            <span className="nwtag">新词</span>
            <span className="en">{ready.result.words[tone]!.word}</span>
            {ready.result.words[tone]!.zh && <span>{ready.result.words[tone]!.zh}</span>}
            <span className="nwhint">在输入法里可一键加入词库</span>
          </p>
        )}
        {card.status === "limited" && (
          <p className="out msg">
            今天的 {PER_DAY} 句免费体验用完了，明天再来，或者<a href="#download">下载 {PRODUCT}</a>，在微信、邮件、文档里直接用。上面的例句仍然可以点。
          </p>
        )}
        {card.status === "error" && <p className="out msg">暂时没连上翻译服务，稍后再试，或先点上面的例句看看。</p>}
        {card.status === "empty" && <p className="out msg">这句没翻好，换个说法再试试。</p>}
        {card.status === "not_chinese" && <p className="out msg">这里体验的是中译英，打几个中文字试试。英文润色请下载输入法体验。</p>}
        <div className="cardfoot">
          <span><kbd>Ctrl J</kbd> 复制</span>
          <span><kbd>Ctrl T</kbd> 换语气</span>
          <span><kbd>Esc</kbd> 清空</span>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
      <p className="demotip">打的字只用来生成这一次的英文，不保存、不记录。每个浏览器每天可免费试 {PER_DAY} 句，例句不限。</p>
    </div>
  );
}

/** Puts `text` into the try-it box and scrolls to it. */
export function TryButton({ text }: { text: string }) {
  return (
    <button type="button" className="trybtn" onClick={() => window.dispatchEvent(new CustomEvent(TRY_EVENT, { detail: text }))}>
      试试这句：<span>{text}</span>
    </button>
  );
}
