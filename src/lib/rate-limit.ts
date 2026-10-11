import "server-only";
import { NotFoundError, db } from "./db";
import { LLMError } from "./llm";

// Cost protection: at most LLM_RATE_LIMIT_PER_HOUR model-calling requests per visitor per clock
// hour (default 60), counted in the visitor's own store. Over the limit, a friendly message —
// handle() maps the "rate_limit" code to HTTP 429 and the chat shows the text.

export function llmLimitPerHour() {
  const n = Number(process.env.LLM_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

export async function spendLlmRequest(now = new Date()): Promise<void> {
  const limit = llmLimitPerHour();
  const hour = now.toISOString().slice(0, 13).replace(/[-T]/g, ""); // e.g. 2026101114
  const id = `llm-${hour}`;
  let count: number;
  try {
    count = (
      await db().update<{ count: number }>("meta", id, (b) => ({
        count: b.count + 1,
      }))
    ).count;
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    await db().put("meta", id, { count: 1 });
    count = 1;
  }
  if (count > limit) {
    const minutes = 60 - now.getUTCMinutes();
    throw new LLMError(
      `You've reached this hour's limit of ${limit} requests to the tutor. It resets in about ${minutes} minute${minutes === 1 ? "" : "s"} — your work is saved.`,
      "rate_limit",
    );
  }
}
