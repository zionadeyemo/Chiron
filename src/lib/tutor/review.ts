import "server-only";
import { countWords } from "../depth";
import type { MathCall } from "../types";
import { RespondSchema, type RespondPayload } from "./schema";
import { TutorError, type ChironOptions } from "./types";

// The checks every provider applies to a `respond` call before the student sees it.
// Each kind of retry is allowed once per turn; after that we accept or salvage.

export interface RetryState {
  schema: boolean;
  verify: boolean;
  length: boolean;
  protocol: boolean;
}

export const freshRetryState = (): RetryState => ({ schema: false, verify: false, length: false, protocol: false });

export type Review = { kind: "accept"; payload: RespondPayload } | { kind: "retry"; message: string };

export function reviewRespond(input: unknown, mathCalls: MathCall[], opts: ChironOptions, retried: RetryState): Review {
  const parsed = RespondSchema.safeParse(input);
  if (!parsed.success) {
    if (!retried.schema) {
      retried.schema = true;
      return { kind: "retry", message: `Invalid respond payload: ${parsed.error.message.slice(0, 1500)}. Call respond again with a valid payload.` };
    }
    const fallback = salvageFromInput(input, opts.targetLevel);
    if (fallback) return { kind: "accept", payload: fallback };
    throw new TutorError("The tutor's answer didn't match the expected format.", "invalid_output");
  }

  const payload = parsed.data;
  if (payload.containsCalculation && !mathCalls.some((c) => c.ok) && !retried.verify) {
    retried.verify = true;
    return {
      kind: "retry",
      message:
        "Your note states a calculation, but no math tool has verified it this turn. Check it with a math tool, then call respond again (or remove the calculation).",
    };
  }
  const words = countWords(payload.response);
  if (!opts.explainMore && words > opts.maxWords * 2 && !retried.length) {
    retried.length = true;
    return {
      kind: "retry",
      message: `Too long: ${words} words against a budget of ${opts.maxWords}. Keep only what the student needs to continue, then call respond again.`,
    };
  }
  return { kind: "accept", payload };
}

export const PROTOCOL_NUDGE = "Finish by calling the respond tool with your note in `response`.";

/** Used when the model answered in plain text twice instead of calling respond. */
export function salvage(text: string, level: number): RespondPayload {
  return {
    response: text,
    explanationDepth: level,
    sources: [],
    containsCalculation: false,
    calculationsVerified: false,
    studentClaim: null,
    detectedConcepts: [],
    knowledgeUpdates: [],
    taskUpdate: null,
    sideQuestion: "none",
  };
}

function salvageFromInput(input: unknown, level: number): RespondPayload | null {
  const r = (input as { response?: unknown })?.response;
  return typeof r === "string" && r.trim() ? salvage(r, level) : null;
}
