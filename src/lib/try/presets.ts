import type { Result } from "./prompt";

// Shared by the try-it box and /api/try: the built-in example sentences
// answer instantly and for free. Their English was produced once by the
// clients' model and prompt (deepseek-v4-flash, remote config prompts, lead
// tone chat), so the examples read like the product does.

export const MAX_INPUT = 150;

export type TrySource = "model" | "example" | "limited" | "error" | "empty" | "not_chinese";
export interface TryReply { source: TrySource; result?: Result }

export interface Preset { text: string; result: Result }

const RAW: [string, Result][] = [
  ["我们改到下周吧", {"tones": {"chat": "Let's move it to next week.", "work": "Let's reschedule to next week.", "academic": "Let us reschedule this to next week."}, "words": {"chat": {"word": "move it to", "zh": "改到"}, "work": {"word": "reschedule", "zh": "重新安排时间"}, "academic": {"word": "reschedule", "zh": "重新安排时间"}}}],
  ["这个报价能不能再便宜一点？", {"tones": {"chat": "Could you make this quote a bit cheaper?", "work": "Could the price in this quote be reduced a little?", "academic": "Could this quotation be somewhat lower in price?"}, "words": {"chat": {"word": "quote", "zh": "报价"}, "work": {"word": "reduced", "zh": "降低"}, "academic": {"word": "quotation", "zh": "报价单"}}}],
  ["老师您好，想约您下周二下午讨论一下论文", {"tones": {"chat": "Hi Professor, I'd like to set up a time with you next Tuesday afternoon to talk about my thesis.", "work": "Hello Professor, I would like to schedule a meeting with you next Tuesday afternoon to discuss the thesis.", "academic": "Dear Professor, I would like to arrange a meeting with you next Tuesday afternoon to discuss the thesis."}, "words": {"chat": {"word": "set up a time", "zh": "约时间"}, "work": {"word": "schedule a meeting", "zh": "安排会面"}, "academic": {"word": "arrange a meeting", "zh": "安排会面"}}}],
  ["这个 deadline 能不能往后推两天", {"tones": {"chat": "Can this deadline be pushed back by two days?", "work": "Could this deadline be extended by two days?", "academic": "Could this deadline be moved back by two days?"}, "words": {"chat": {"word": "pushed back", "zh": "往后推"}, "work": {"word": "extended", "zh": "延长"}, "academic": {"word": "moved back", "zh": "往后移"}}}],
  ["小组作业我负责数据分析这部分", {"tones": {"chat": "I'm handling the data analysis part of the group assignment.", "work": "I am responsible for the data analysis portion of the group assignment.", "academic": "I am responsible for the data analysis component of the group assignment."}, "words": {"chat": {"word": "handling", "zh": "负责处理"}, "work": {"word": "responsible for", "zh": "负责"}, "academic": {"word": "component", "zh": "组成部分"}}}],
  ["我们想邀请你合作推广这款新品", {"tones": {"chat": "We'd like to invite you to collaborate on promoting this new product.", "work": "We would like to invite you to collaborate on the promotion of this new product.", "academic": "We would like to invite you to collaborate on promoting this new product."}, "words": {"chat": {"word": "collaborate on", "zh": "合作开展"}, "work": {"word": "the promotion of", "zh": "……的推广"}, "academic": {"word": "invite you to", "zh": "邀请你"}}}],
];

export const PRESETS: Preset[] = RAW.map(([text, result]) => ({ text, result }));

const key = (s: string) => s.replace(/\s+/g, "").replace(/[。.！!？?，,]+$/, "");
const BY_KEY = new Map(PRESETS.map((p) => [key(p.text), p]));

/** The built-in example `text` matches, ignoring spaces and final punctuation. */
export const preset = (text: string): Preset | undefined => BY_KEY.get(key(text));
