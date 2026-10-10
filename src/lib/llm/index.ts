import "server-only";
import { AnthropicLLM } from "./anthropic";
import { GeminiLLM } from "./gemini";
import { MockLLM } from "./mock";
import { LLMError, type Effort, type LLM, type Tier } from "./types";

export { LLMError } from "./types";
export type { LLM, Part, Tier } from "./types";

type Provider = "anthropic" | "gemini";

const DEFAULT_MODELS: Record<Provider, Record<Tier, string>> = {
  // Aliases that track Google's current Pro / Flash, so they don't go stale.
  gemini: { strong: "gemini-pro-latest", fast: "gemini-flash-latest" },
  anthropic: { strong: "claude-opus-5-5", fast: "claude-opus-5-5" },
};

const env = (name: string) => process.env[name]?.trim() || undefined;

/**
 * LLM_PROVIDER wins if set; otherwise the key decides: Anthropic keys start with "sk-ant-",
 * anything else is treated as a Google (Gemini) key.
 * Models: LLM_PLANNER_MODEL (strong) and LLM_CHAT_MODEL (fast); LLM_MODEL sets both.
 */
export function resolveConfig(): { provider: Provider; models: Record<Tier, string>; effort?: Effort; plannerEffort?: Effort } | null {
  const key = env("LLM_API_KEY");
  if (!key) return null;
  const explicit = env("LLM_PROVIDER")?.toLowerCase();
  const provider: Provider = explicit === "anthropic" || explicit === "gemini" ? explicit : key.startsWith("sk-ant-") ? "anthropic" : "gemini";
  const models = {
    strong: env("LLM_PLANNER_MODEL") ?? env("LLM_MODEL") ?? DEFAULT_MODELS[provider].strong,
    fast: env("LLM_CHAT_MODEL") ?? env("LLM_MODEL") ?? DEFAULT_MODELS[provider].fast,
  };
  const pick = (name: string) => (["low", "medium", "high"] as const).find((e) => e === env(name)?.toLowerCase());
  // Planner thinking defaults to medium: in the planner eval it halved plan time with the same
  // accuracy (verification + repair catch slips). LLM_PLANNER_EFFORT=high for maximum care.
  return { provider, models, effort: pick("LLM_EFFORT"), plannerEffort: pick("LLM_PLANNER_EFFORT") ?? "medium" };
}

let cached: LLM | null = null;

/** The configured LLM. The mock is used only when LLM_MOCK=1 — never as a silent fallback. */
export function getLLM(): LLM {
  if (cached) return cached;
  if (env("LLM_MOCK") === "1") return (cached = new MockLLM());
  const config = resolveConfig();
  if (!config) throw new LLMError("No API key yet. Add LLM_API_KEY to .env.local and restart the dev server.", "no_key");
  const key = env("LLM_API_KEY")!;
  const efforts = { fast: config.effort, strong: config.plannerEffort };
  cached = config.provider === "anthropic" ? new AnthropicLLM(key, config.models, efforts) : new GeminiLLM(key, config.models, efforts);
  return cached;
}

export function llmStatus() {
  if (env("LLM_MOCK") === "1") return { tutor: "mock" as const };
  const config = resolveConfig();
  return config ? { tutor: "live" as const, provider: config.provider, models: config.models } : { tutor: "no_key" as const };
}
