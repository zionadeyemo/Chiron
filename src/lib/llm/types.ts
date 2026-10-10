import type { z } from "zod";
import type { MathCall } from "../types";

// The one server-side LLM boundary. Providers implement `LLM`; callers never import a provider.

/** strong = Planner and work judging; fast = setup, chat, intent, check questions. */
export type Tier = "strong" | "fast";
export type Effort = "low" | "medium" | "high";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type Part = { type: "text"; text: string } | { type: "image"; mediaType: ImageMediaType; base64: string };

interface BaseRequest {
  tier: Tier;
  system: string;
  parts: Part[];
  /** Names the call for logs and the offline mock (e.g. "intake", "plan", "chat"). */
  label: string;
  effort?: Effort;
}

export interface StructuredRequest<T> extends BaseRequest {
  schema: z.ZodType<T>;
}

export interface ToolTurnRequest<T> extends BaseRequest {
  respond: {
    schema: z.ZodType<T>;
    description: string;
    /** Return a message to send the model back once (e.g. "verify that calculation"), or null to accept. */
    review?: (payload: T, mathCalls: MathCall[]) => string | null;
  };
}

export interface TextRequest extends BaseRequest {
  history: { role: "user" | "assistant"; text: string }[];
}

export interface ToolTurnResult<T> {
  payload: T;
  mathCalls: MathCall[];
}

export interface LLM {
  readonly provider: "gemini" | "anthropic" | "mock";
  readonly models: Record<Tier, string>;
  /** JSON output matching `schema`; one retry with the validation error, then LLMError. */
  structured<T>(req: StructuredRequest<T>): Promise<T>;
  /** Math tools available; the turn ends with a `respond` call matching the schema. */
  toolTurn<T>(req: ToolTurnRequest<T>): Promise<ToolTurnResult<T>>;
  text(req: TextRequest): Promise<string>;
}

export type LLMErrorCode = "no_key" | "auth" | "rate_limit" | "api" | "network" | "refusal" | "invalid_output";

export class LLMError extends Error {
  constructor(
    message: string,
    public code: LLMErrorCode,
  ) {
    super(message);
  }
}
