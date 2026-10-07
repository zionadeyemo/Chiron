import "server-only";
import { ANTHROPIC_DEFAULT_MODEL, AnthropicTutor } from "./anthropic";
import { GEMINI_DEFAULT_MODEL, GeminiTutor } from "./gemini";
import { MockTutor } from "./mock";
import { TutorError, type Tutor } from "./types";

export { TutorError } from "./types";

export type Provider = "anthropic" | "gemini";

/**
 * LLM_PROVIDER wins if set. Otherwise the key decides: Anthropic keys start with
 * "sk-ant-"; anything else is treated as a Google (Gemini) key.
 */
export function resolveProvider(): { provider: Provider; model: string } | null {
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) return null;
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const provider: Provider =
    explicit === "anthropic" || explicit === "gemini" ? explicit : key.startsWith("sk-ant-") ? "anthropic" : "gemini";
  const model = process.env.LLM_MODEL?.trim() || (provider === "anthropic" ? ANTHROPIC_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL);
  return { provider, model };
}

let cached: Tutor | null = null;

/** The configured tutor. Mock only when LLM_MOCK=1 — never as a silent fallback. */
export function getTutor(): Tutor {
  if (cached) return cached;
  if (process.env.LLM_MOCK === "1") return (cached = new MockTutor());
  const resolved = resolveProvider();
  if (!resolved) {
    throw new TutorError("No API key yet. Add LLM_API_KEY to .env.local and restart the dev server.", "no_key");
  }
  const key = process.env.LLM_API_KEY!.trim();
  cached = resolved.provider === "anthropic" ? new AnthropicTutor(key, resolved.model) : new GeminiTutor(key, resolved.model);
  return cached;
}

export function tutorStatus() {
  if (process.env.LLM_MOCK === "1") return { tutor: "mock" as const };
  const resolved = resolveProvider();
  return resolved ? { tutor: "live" as const, ...resolved } : { tutor: "no_key" as const };
}
