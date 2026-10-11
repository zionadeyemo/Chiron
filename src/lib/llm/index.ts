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

/** Accepted names for the key, in order. LLM_API_KEY is the documented one. */
const KEY_NAMES = ["LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY"] as const;

/**
 * The API key, read at request time, on the server only. Tolerates a value pasted with
 * surrounding quotes (a common slip in hosting dashboards). Never sent to the client.
 */
function apiKey(): string | undefined {
  for (const name of KEY_NAMES) {
    const value = env(name)?.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (value) return value;
  }
  return undefined;
}

/** What to tell someone whose server sees no key. Vercel sets VERCEL_ENV at runtime. */
export function missingKeyHelp(): string {
  const vercelEnv = env("VERCEL_ENV");
  if (vercelEnv) {
    const scope = vercelEnv === "production" ? "Production" : vercelEnv === "preview" ? "Preview" : "Development";
    return `No API key found on this ${vercelEnv} deployment. In Vercel → Settings → Environment Variables, add LLM_API_KEY for the ${scope} environment, then redeploy — existing deployments don't pick up new variables.`;
  }
  return "No API key found. Add LLM_API_KEY=… to .env.local and restart the dev server.";
}

/**
 * LLM_PROVIDER wins if set; otherwise the key decides: Anthropic keys start with "sk-ant-",
 * anything else is treated as a Google (Gemini) key.
 * Models: LLM_PLANNER_MODEL (strong) and LLM_CHAT_MODEL (fast); LLM_MODEL sets both.
 */
export function resolveConfig(): { provider: Provider; models: Record<Tier, string>; effort?: Effort; plannerEffort?: Effort } | null {
  const key = apiKey();
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
  if (!config) throw new LLMError(missingKeyHelp(), "no_key");
  const key = apiKey()!;
  const efforts = { fast: config.effort, strong: config.plannerEffort };
  cached = config.provider === "anthropic" ? new AnthropicLLM(key, config.models, efforts) : new GeminiLLM(key, config.models, efforts);
  return cached;
}

export function llmStatus() {
  if (env("LLM_MOCK") === "1") return { tutor: "mock" as const };
  const config = resolveConfig();
  return config ? { tutor: "live" as const, provider: config.provider, models: config.models } : { tutor: "no_key" as const, help: missingKeyHelp() };
}
