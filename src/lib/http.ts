import "server-only";
import { ZodError } from "zod";
import { BoardError } from "./board/reveal";
import { NotFoundError } from "./db";
import { LLMError } from "./llm";

/** Wraps a route handler body: JSON out, typed errors mapped to status codes and a readable message. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof ZodError) return Response.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof BoardError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof LLMError) {
      const status = err.code === "no_key" || err.code === "auth" ? 503 : err.code === "rate_limit" ? 429 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong on the server. Try again." }, { status: 500 });
  }
}
