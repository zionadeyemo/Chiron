import { afterEach, describe, expect, it, vi } from "vitest";
import { missingKeyHelp, resolveConfig } from ".";

describe("API key detection", () => {
  afterEach(() => vi.unstubAllEnvs());
  const clear = () => {
    for (const name of ["LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER", "VERCEL_ENV"]) vi.stubEnv(name, "");
  };

  it("reads LLM_API_KEY and detects the provider", () => {
    clear();
    vi.stubEnv("LLM_API_KEY", "AIza-test");
    expect(resolveConfig()?.provider).toBe("gemini");
    vi.stubEnv("LLM_API_KEY", "sk-ant-test");
    expect(resolveConfig()?.provider).toBe("anthropic");
  });

  it("tolerates quotes and whitespace pasted into a dashboard", () => {
    clear();
    vi.stubEnv("LLM_API_KEY", ' "sk-ant-test" ');
    expect(resolveConfig()?.provider).toBe("anthropic");
  });

  it("falls back to the provider's conventional variable names", () => {
    clear();
    vi.stubEnv("GEMINI_API_KEY", "AIza-test");
    expect(resolveConfig()?.provider).toBe("gemini");
  });

  it("reports no key, with guidance for where the app runs", () => {
    clear();
    expect(resolveConfig()).toBeNull();
    expect(missingKeyHelp()).toContain(".env.local");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(missingKeyHelp()).toMatch(/Preview environment, then redeploy/);
  });
});
