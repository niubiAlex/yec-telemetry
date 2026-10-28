// The client's Chinese -> English prompt and reply checks, for the homepage
// try-it box. Ported from the IME (Sources/YoudaoIME/AI/PromptBuilder.swift,
// PromptSection.swift, Suggestion.swift); keep them in step. The wording a
// client actually sends is the remote config's `prompts` over these built-in
// texts, and the route passes the same overrides in.

export const TONE_KEYS = ["chat", "work", "academic"] as const;
export type ToneKey = (typeof TONE_KEYS)[number];
export const isToneKey = (v: unknown): v is ToneKey => typeof v === "string" && (TONE_KEYS as readonly string[]).includes(v);

/** Tone.instruction */
export const TONE_INSTRUCTION: Record<ToneKey, string> = {
  chat:
    "how a person actually texts on WeChat. Short, spoken English; contractions and " +
    "everyday words; a fragment is fine where a texter would use one. No greeting, no " +
    'sign-off, no stiff opener ("I would like to", "Please be informed"), no email structure.',
  work:
    "a workplace message to a colleague, fine for IM or email. Clear, polite and " +
    "actionable: complete sentences addressed to the reader, saying plainly what is needed " +
    'and by when if the Chinese says so; "could you" / "please" are fine. No slang, no ' +
    'academic hedging, no "Dear ..." or sign-off.',
  academic:
    "formal written English, the way a report or paper would state it. Impersonal and " +
    "precise: exact terms, complete sentences, passive voice or nominalization where natural " +
    '("the proposal should be revised", not "please revise the proposal"), no contractions; ' +
    "cautious exactly where the Chinese is cautious (可能 -> may, 应该 -> should) and nowhere " +
    "else. No chat fillers, no exclamation marks.",
};

/** PromptSection.all, the sections a translation without a learning target uses. */
export const SECTION: Record<string, string> = {
  system:
    "You are an English writing coach built into a Chinese user's keyboard.\n" +
    "Reply with ONLY compact JSON. No markdown fence, no commentary, no reasoning.",
  newWord:
    "For each tone, pick at most one word or short phrase worth learning, copied exactly as written in THAT tone's translation, with its Chinese meaning: the {tone} one in new_word / new_word_zh, the others in tone_new_words. Prefer a useful collocation (like \"room for negotiation\") over a rare single word. Skip basic everyday words, proper nouns and the recall_word. The user's English is CEFR {level}: pick one at {level} if there is one, otherwise the least advanced above it; never easier. Words the user has looked up (their level; never pick these): {lookups}. Never change a translation to fit one in; leave it empty if nothing qualifies.",
  translate:
    "Translate the Chinese into English three ways. Each is a different way of writing the same message, not the same sentence with different adjectives:\n" +
    "{tones}\n" +
    "All three say exactly what the Chinese says: nothing added, nothing left out. Never give two tones the same wording: each is written its own way.",
  rules:
    "English words and acronyms inside the Chinese (such as ROI, KPI, deadline) are already English: keep each one exactly as written, in every tone. Never translate them or drop them.\n" +
    "Keep every number exactly, in every tone: digits, amounts, prices, times, dates, percentages and version numbers must all appear in the English (write them as digits).\n" +
    "Placeholders like [MENTION_A] are names: copy each one unchanged into every tone, even where that tone could leave the name out.",
  lostNumbers: "A previous draft dropped {numbers}. Include it exactly.",
};

export interface Overrides {
  tones?: Record<string, string>;
  sections?: Record<string, string>;
}

/** A fresh install: CEFR B1 (Settings.englishLevel's default), nothing looked up yet. */
export const LEVEL = "B1";

/** PromptSection.fill: one pass, so braces inside a value are left alone. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^{}]*)\}/g, (m, name: string) => (name in values ? values[name] : m));
}

const section = (o: Overrides, id: string) => o.sections?.[id] ?? SECTION[id] ?? "";
const tone = (o: Overrides, t: ToneKey) => o.tones?.[t] ?? TONE_INSTRUCTION[t];

export const systemPrompt = (o: Overrides) => section(o, "system");

/** PromptBuilder.translate for a new user: no context, learning target or recommendation; new words on. */
export function translatePrompt(chinese: string, lead: ToneKey, o: Overrides, lostNumbers: string[] = []): string {
  const block = (id: string, values: Record<string, string>) => fill(section(o, id), values).trim();
  const others = TONE_KEYS.filter((t) => t !== lead);
  let p = block("newWord", { tone: lead, level: LEVEL, lookups: "none" }) + "\n";
  p += block("translate", { tones: TONE_KEYS.map((t) => `- ${t}: ${tone(o, t)}`).join("\n") });
  p += "\n" + block("rules", {});
  if (lostNumbers.length) p += "\n" + block("lostNumbers", { numbers: lostNumbers.join(", ") });
  p +=
    "\nReply JSON, keys in exactly this order:\n" +
    `{"kind":"translate","${lead}":"...",` +
    `"recall_word":"","recall_zh":"","new_word":"","new_word_zh":"",` +
    `"tones":{${others.map((t) => `"${t}":"..."`).join(",")}},` +
    `"tone_new_words":{${others.map((t) => `"${t}":{"word":"","zh":""}`).join(",")}},` +
    `"learnable":[{"phrase":"","zh":""}]}\n\n` +
    `Chinese: ${chinese}`;
  return p;
}

/** The client's max_tokens for a translation. */
export const maxTokens = (chinese: string) => Math.max(460, 360 + [...chinese].length * 5);

export interface NewWord { word: string; zh?: string }
export interface Result {
  tones: Record<ToneKey, string>;
  /** Per tone, a word or phrase worth learning, exactly as written in that tone. */
  words: Partial<Record<ToneKey, NewWord>>;
}

const HAN = /[\u4e00-\u9fff]/;
export const containsHan = (s: string) => HAN.test(s);

/** SuggestionParser.isChinese: mostly Chinese, mixed input included. */
export function isChinese(s: string): boolean {
  const han = (s.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (s.match(/[A-Za-z]/g) ?? []).length;
  return han > 0 && han * 3 >= latin;
}

export function extractJSON(raw: string): Record<string, unknown> | null {
  let s = raw.replace(/<think>[\s\S]*?(<\/think>|$)/, "").replace(/```json/g, "").replace(/```/g, "").trim();
  const tryParse = (t: string) => {
    try {
      const o = JSON.parse(t);
      return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const whole = tryParse(s);
  if (whole) return whole;
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open < 0 || close <= open) return null;
  s = s.slice(open, close + 1);
  return tryParse(s);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// --- Numbers and typed English the draft must keep (SuggestionParser) -------

interface NumberToken { value: string; unit: string | null }

export function numberTokens(s: string): NumberToken[] {
  let text = s.replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30)).replace(/\uff0e/g, ".");
  text = text.replace(/(?<=\d)[,，](?=\d{3}(?!\d))/g, "");
  const out: NumberToken[] = [];
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    let i = m.index! + m[0].length;
    while (text[i] === " ") i++;
    out.push({ value: m[0], unit: i < text.length ? [...text.slice(i)][0] : null });
  }
  return out;
}

const SMALL = [
  ["zero"], ["one", "first"], ["two", "second"], ["three", "third"], ["four", "fourth"], ["five", "fifth"],
  ["six", "sixth"], ["seven", "seventh"], ["eight", "eighth"], ["nine", "ninth"], ["ten", "tenth"],
  ["eleven", "eleventh"], ["twelve", "twelfth"], ["thirteen", "thirteenth"], ["fourteen", "fourteenth"],
  ["fifteen", "fifteenth"], ["sixteen", "sixteenth"], ["seventeen", "seventeenth"], ["eighteen", "eighteenth"],
  ["nineteen", "nineteenth"], ["twenty", "twentieth"],
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (w: string, text: string, prefix = false) =>
  new RegExp(`(?<![A-Za-z])${esc(w)}${prefix ? "" : "(?![A-Za-z])"}`, "i").test(text);

function carries(n: NumberToken, found: string[], text: string): boolean {
  const value = Number(n.value);
  if (found.some((f) => f === n.value || Number(f) === value)) return true;
  const int = n.value.includes(".") ? null : Number.parseInt(n.value, 10);
  if (n.unit === "月" && int !== null && int >= 1 && int <= 12 && hasWord(MONTHS[int - 1], text, true)) return true;
  if (n.unit && "万千百亿".includes(n.unit)) {
    const digits = n.value.replace(".", "");
    if (found.some((f) => f.replace(".", "").startsWith(digits))) return true;
  }
  if (n.unit && "点时".includes(n.unit) && int !== null && int >= 13 && int <= 23 && found.includes(String(int - 12))) return true;
  if (int !== null && int < SMALL.length && n.unit !== "%" && SMALL[int].some((w) => hasWord(w, text))) return true;
  const measure = n.unit !== null && "个位次件本张台只条份家间种项".includes(n.unit);
  const idioms =
    int === 1 && measure ? ["a", "an", "single"]
    : int === 2 && measure ? ["couple", "both", "pair"]
    : int === 12 && n.unit === "点" ? ["noon", "midnight"]
    : int === 15 && n.unit === "分" ? ["quarter"]
    : int === 30 && n.unit === "分" ? ["half"]
    : [];
  return idioms.some((w) => hasWord(w, text));
}

export function lostNumbers(original: string, texts: string[]): string[] {
  const source = numberTokens(original);
  const lost: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    const found = numberTokens(t).map((n) => n.value);
    for (const n of source) if (!lost.includes(n.value) && !carries(n, found, t.toLowerCase())) lost.push(n.value);
  }
  return lost;
}

const INTERJECTIONS = new Set(["ok", "okay", "hi", "hello", "bye", "thanks", "sorry", "yes", "no", "please", "lol", "haha"]);

export function englishTokens(s: string): string[] {
  const out: string[] = [];
  for (const m of s.replace(/\[MENTION_[A-Z]\]/g, " ").matchAll(/[A-Za-z][A-Za-z0-9]*/g)) {
    const w = m[0];
    if (w.length >= 2 && !out.includes(w) && !INTERJECTIONS.has(w.toLowerCase())) out.push(w);
  }
  return out;
}

export function lostEnglish(original: string, texts: string[]): string[] {
  const lost: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const w of englishTokens(original)) {
      if (!lost.includes(w) && !new RegExp(`(?<![A-Za-z])${esc(w)}(?:e?s)?(?![A-Za-z])`, "i").test(t)) lost.push(w);
    }
  }
  return lost;
}

/** `phrase` as written in `text`, matched case-insensitively on word boundaries. */
export function verbatim(phrase: string, text: string): string | null {
  const p = phrase.replace(/^[ .,;:!?"']+|[ .,;:!?"']+$/g, "");
  if (!p) return null;
  const m = new RegExp(`(?<![A-Za-z])${esc(p)}(?![A-Za-z])`, "i").exec(text);
  return m ? m[0] : null;
}

export type Parsed = { ok: true; result: Result } | { ok: false; lost: string[] };

/** SuggestionParser.normalize for a translation (no vocabulary, no mentions). */
export function parseTranslation(raw: string, original: string, lead: ToneKey): Parsed {
  const obj = extractJSON(raw);
  if (!obj) return { ok: false, lost: [] };
  const src = (typeof obj.tones === "object" && obj.tones !== null ? obj.tones : {}) as Record<string, unknown>;
  const given = (t: ToneKey) => str(obj[t]) || str(src[t]);
  const fallback = given(lead) || TONE_KEYS.map(given).find(Boolean) || str(obj.replacement);
  const tones = Object.fromEntries(TONE_KEYS.map((t) => [t, given(t) || fallback])) as Record<ToneKey, string>;

  const order = [lead, ...TONE_KEYS.filter((t) => t !== lead)];
  const english = order.map((t) => tones[t]).filter((t) => t && !containsHan(t));
  const leading = english.find((t) => lostEnglish(original, [t]).length === 0) ?? english[0];
  if (!leading) return { ok: false, lost: [] };
  const leadingKeeps = lostEnglish(original, [leading]).length === 0;
  for (const t of TONE_KEYS) {
    if (containsHan(tones[t]) || (leadingKeeps && lostEnglish(original, [tones[t]]).length > 0)) tones[t] = leading;
  }
  const all = Object.values(tones);
  const lost = [...lostNumbers(original, all), ...lostEnglish(original, all)];
  if (lost.length) return { ok: false, lost };

  const words: Partial<Record<ToneKey, NewWord>> = {};
  const lw = str(obj.new_word);
  const exact = lw ? verbatim(lw, tones[lead]) : null;
  if (exact) words[lead] = { word: exact, zh: str(obj.new_word_zh) || undefined };
  const per = (typeof obj.tone_new_words === "object" && obj.tone_new_words !== null ? obj.tone_new_words : {}) as Record<string, unknown>;
  for (const t of TONE_KEYS) {
    if (t === lead || tones[t] === tones[lead]) continue;
    const e = per[t] as Record<string, unknown> | undefined;
    const w = e && typeof e === "object" ? str(e.word) : "";
    const x = w ? verbatim(w, tones[t]) : null;
    if (x) words[t] = { word: x, zh: str(e!.zh) || undefined };
  }
  for (const t of TONE_KEYS) if (!words[t] && tones[t] === tones[lead] && words[lead]) words[t] = words[lead];
  return { ok: true, result: { tones, words } };
}
