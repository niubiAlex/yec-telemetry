import { getDoc } from "@/lib/db";
import { checkConfig } from "@/lib/remote";
import { maxTokens, parseTranslation, systemPrompt, translatePrompt, type Overrides, type Result, type ToneKey } from "./prompt";

// Which model answers the try-it box. By default the one the clients use: the
// remote config's gateway (base URL, model, fallback model and key) and its
// prompt overrides, read from the same `config` document /api/config serves,
// so the page changes when the clients do. LLM_BASE_URL + LLM_API_KEY (+
// LLM_MODEL), the names english.ltd uses, replace the gateway when both are set.

interface Gateway { baseURL: string; model: string; fallbackModel?: string; key: string }
interface Setup { gateway: Gateway | null; prompts: Overrides }

let cached: { at: number; setup: Setup } | null = null;

async function setup(): Promise<Setup> {
  if (cached && Date.now() - cached.at < 60_000) return cached.setup;
  let prompts: Overrides = {};
  let gateway: Gateway | null = null;
  const doc = await getDoc("config");
  const checked = doc ? checkConfig(doc.body) : null;
  if (checked?.ok) {
    prompts = checked.value.prompts ?? {};
    const g = checked.value.gateway;
    if (g?.key) gateway = { baseURL: g.baseURL, model: g.model, fallbackModel: g.fallbackModel, key: g.key };
  }
  const envBase = process.env.LLM_BASE_URL;
  const envKey = process.env.LLM_API_KEY;
  if (envBase && envKey) gateway = { baseURL: envBase, model: process.env.LLM_MODEL || gateway?.model || "deepseek-v4-flash", key: envKey };
  const s = { gateway, prompts };
  cached = { at: Date.now(), setup: s };
  return s;
}

export async function available(): Promise<boolean> {
  return (await setup()).gateway !== null;
}

class ModelError extends Error {
  constructor(readonly status: number) { super(`model ${status}`); }
}

async function complete(g: Gateway, model: string, system: string, user: string, tokens: number): Promise<string> {
  const send = (thinkingOff: boolean) =>
    fetch(`${g.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${g.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model, stream: false, max_tokens: tokens, temperature: 0.3,
        ...(thinkingOff ? { thinking: { type: "disabled" } } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  // The clients always send `thinking: disabled`; a gateway that rejects the
  // field for some model gets one retry without it.
  let r = await send(true);
  if (r.status === 400) r = await send(false);
  if (!r.ok) throw new ModelError(r.status);
  const body = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

/** LLMClient.worthFallback: the model is down, missing or overloaded. */
const worthFallback = (e: unknown) =>
  e instanceof ModelError ? e.status === 404 || e.status === 429 || e.status >= 500 : !(e instanceof Error && e.name === "TimeoutError");

async function ask(s: Setup, user: string, chinese: string): Promise<string> {
  const g = s.gateway!;
  try {
    return await complete(g, g.model, systemPrompt(s.prompts), user, maxTokens(chinese));
  } catch (e) {
    if (!g.fallbackModel || g.fallbackModel === g.model || !worthFallback(e)) throw e;
    return complete(g, g.fallbackModel, systemPrompt(s.prompts), user, maxTokens(chinese));
  }
}

/** The three tones for `chinese`, or null when the drafts kept dropping a number. Throws on failure. */
export async function translate(chinese: string, lead: ToneKey): Promise<Result | null> {
  const s = await setup();
  if (!s.gateway) throw new Error("no gateway");
  const first = parseTranslation(await ask(s, translatePrompt(chinese, lead, s.prompts), chinese), chinese, lead);
  if (first.ok) return first.result;
  if (!first.lost.length) throw new Error("model reply was not a usable translation");
  // Once, as in the client: a model that drops a number twice will not keep it on a third try.
  const second = parseTranslation(await ask(s, translatePrompt(chinese, lead, s.prompts, first.lost), chinese), chinese, lead);
  return second.ok ? second.result : null;
}
