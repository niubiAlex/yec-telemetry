// Remote config and update manifests (docs/remote-update.md in the IME's
// project store). The clients repeat these checks and ignore a whole document
// that fails them, so a bad publish can never break typing; this side refuses
// to store one in the first place.

import { TONES } from "./schema";

export const MAX_DOC_BYTES = 64 * 1024;
export const PLATFORMS = ["mac", "windows"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const CHANNELS = ["stable", "test"] as const;

const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const MODEL = /^[A-Za-z0-9._:/-]{1,64}$/;
const KEY = /^[A-Za-z0-9._-]{8,256}$/;
const SECTION = /^[A-Za-z0-9_]{1,40}$/;
const FLAG = /^[A-Za-z0-9_]{1,40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isHttps = (v: unknown) => {
  if (typeof v !== "string" || v.length > 300) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const int = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Only the fields listed may appear; a typo is an error, not a silent no-op. */
function onlyKeys(o: Obj, allowed: string[], where: string): string | null {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return `${where}.${k} is not a known field`;
  return null;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface RemoteConfig {
  schema: 1;
  revision: number;
  prompts?: { tones?: Record<string, string>; sections?: Record<string, string> };
  gateway?: {
    revision: number;
    appliesTo: string[];
    baseURL: string;
    models: string[];
    model: string;
    fallbackModel?: string;
    key?: string;
  };
  flags?: Record<string, boolean>;
  telemetry?: { enabled: boolean };
  notice?: { minVersion: string; text: string };
}

export function checkConfig(body: unknown): Checked<RemoteConfig> {
  const bad = (error: string): Checked<RemoteConfig> => ({ ok: false, error });
  if (!isObject(body)) return bad("config must be an object");
  const unknown = onlyKeys(body, ["schema", "revision", "prompts", "gateway", "flags", "telemetry", "notice"], "config");
  if (unknown) return bad(unknown);
  if (body.schema !== 1) return bad("schema must be 1");
  if (!int(body.revision, 1, 1e9)) return bad("revision must be a positive integer");

  const { prompts, gateway, flags, telemetry, notice } = body;
  if (prompts !== undefined) {
    if (!isObject(prompts)) return bad("prompts");
    const u = onlyKeys(prompts, ["tones", "sections"], "prompts");
    if (u) return bad(u);
    if (prompts.tones !== undefined) {
      if (!isObject(prompts.tones)) return bad("prompts.tones");
      for (const [k, v] of Object.entries(prompts.tones)) {
        if (!(TONES as readonly string[]).includes(k)) return bad(`prompts.tones.${k} is not a tone`);
        if (!text(v, 4000)) return bad(`prompts.tones.${k}`);
      }
    }
    if (prompts.sections !== undefined) {
      if (!isObject(prompts.sections)) return bad("prompts.sections");
      for (const [k, v] of Object.entries(prompts.sections)) {
        if (!SECTION.test(k) || !text(v, 8000)) return bad(`prompts.sections.${k}`);
      }
    }
  }
  if (gateway !== undefined) {
    if (!isObject(gateway)) return bad("gateway");
    const u = onlyKeys(gateway, ["revision", "appliesTo", "baseURL", "models", "model", "fallbackModel", "key"], "gateway");
    if (u) return bad(u);
    if (!int(gateway.revision, 1, 1e9)) return bad("gateway.revision");
    const { appliesTo, models } = gateway;
    if (!Array.isArray(appliesTo) || appliesTo.length === 0 || appliesTo.length > 8 || !appliesTo.every(isHttps)) {
      return bad("gateway.appliesTo must list the https base URLs it replaces");
    }
    if (!isHttps(gateway.baseURL)) return bad("gateway.baseURL");
    if (!Array.isArray(models) || models.length === 0 || models.length > 8 ||
        !models.every((m) => typeof m === "string" && MODEL.test(m))) return bad("gateway.models");
    if (typeof gateway.model !== "string" || !models.includes(gateway.model)) return bad("gateway.model must be one of models");
    if (gateway.fallbackModel !== undefined &&
        (typeof gateway.fallbackModel !== "string" || !MODEL.test(gateway.fallbackModel))) return bad("gateway.fallbackModel");
    if (gateway.key !== undefined && (typeof gateway.key !== "string" || !KEY.test(gateway.key))) return bad("gateway.key");
  }
  if (flags !== undefined) {
    if (!isObject(flags)) return bad("flags");
    for (const [k, v] of Object.entries(flags)) if (!FLAG.test(k) || typeof v !== "boolean") return bad(`flags.${k}`);
  }
  if (telemetry !== undefined) {
    if (!isObject(telemetry) || typeof telemetry.enabled !== "boolean") return bad("telemetry.enabled");
    const u = onlyKeys(telemetry, ["enabled"], "telemetry");
    if (u) return bad(u);
  }
  if (notice !== undefined) {
    if (!isObject(notice)) return bad("notice");
    const u = onlyKeys(notice, ["minVersion", "text"], "notice");
    if (u) return bad(u);
    if (typeof notice.minVersion !== "string" || !VERSION.test(notice.minVersion)) return bad("notice.minVersion");
    if (!text(notice.text, 200)) return bad("notice.text");
  }
  return { ok: true, value: body as unknown as RemoteConfig };
}

/** What a client gets: the key only for a request that carries the token. */
export function forClient(config: RemoteConfig, withKey: boolean): RemoteConfig {
  if (withKey || !config.gateway?.key) return config;
  const { key: _key, ...gateway } = config.gateway;
  return { ...config, gateway };
}

export interface Manifest {
  version: string;
  urls: string[];
  sha256: string;
  size: number;
  notes: string;
  published: string;
}

export function checkManifest(body: unknown): Checked<Manifest> {
  const bad = (error: string): Checked<Manifest> => ({ ok: false, error });
  if (!isObject(body)) return bad("manifest must be an object");
  const u = onlyKeys(body, ["version", "urls", "sha256", "size", "notes", "published"], "manifest");
  if (u) return bad(u);
  if (typeof body.version !== "string" || !VERSION.test(body.version)) return bad("version");
  const { urls } = body;
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > 4 || !urls.every(isHttps)) return bad("urls");
  if (typeof body.sha256 !== "string" || !SHA256.test(body.sha256)) return bad("sha256");
  if (!int(body.size, 1, 1024 * 1024 * 1024)) return bad("size");
  if (typeof body.notes !== "string" || body.notes.length > 1000) return bad("notes");
  if (typeof body.published !== "string" || Number.isNaN(Date.parse(body.published))) return bad("published");
  return { ok: true, value: body as unknown as Manifest };
}

/** Document names: `config`, `update-<platform>` and `update-<platform>-test`. */
export function docName(kind: "config" | Platform, channel: string = "stable"): string | null {
  if (kind === "config") return "config";
  if (!(PLATFORMS as readonly string[]).includes(kind)) return null;
  if (channel === "stable") return `update-${kind}`;
  if (channel === "test") return `update-${kind}-test`;
  return null;
}

export function checkDoc(name: string, body: unknown): Checked<unknown> {
  if (name === "config") return checkConfig(body);
  if (/^update-(mac|windows)(-test)?$/.test(name)) return checkManifest(body);
  return { ok: false, error: "unknown document" };
}
