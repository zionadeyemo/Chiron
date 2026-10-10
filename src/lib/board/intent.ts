import type { Intent } from "./llm-schemas";

// Intent routing (brief 2.6). Unambiguous messages are classified by rules — no model call,
// so "next" or "hint" act instantly. Everything else is classified by the chat model in the
// same call that writes the answer.

export interface RuleResult {
  intent: Intent;
  stepRef?: number;
}

const NEXT = /^(?:ok(?:ay)?[, ]+)?(?:next(?: step)?|keep going|continue|go on|what'?s next|and then|what now|what do i do next)[.!?]*$/i;
const HINT = /^(?:(?:can i (?:get|have)|give me|i need|got)\s+)?(?:a\s+)?(?:small\s+|little\s+)?(?:hint|nudge|clue)(?:\s+please)?[.!?]*$|^i'?m stuck[.!?]*$/i;
const CLAIM = /^(?:i (?:got|get|have|think|found|wrote)|my (?:answer|line|result|work) (?:is|was)|so|then|is it|i'?d say)\b/i;
const MATHY = /^[\w\s()+\-*/^=.,\\{}[\]|'′_√·×−]+$/;

/** "step 2", "step #3", "the 2nd step" → 2 / 3. */
export function stepRefFrom(text: string): number | undefined {
  const m = text.match(/\bstep\s*#?\s*(\d{1,2})\b/i) ?? text.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+step\b/i);
  return m ? Number(m[1]) : undefined;
}

export function ruleIntent(text: string, ctx: { hasProblem: boolean; hasImages: boolean }): RuleResult | null {
  const t = text.trim();
  if (!ctx.hasProblem || ctx.hasImages || !t) return null;
  if (NEXT.test(t)) return { intent: "ask_next_step" };
  if (HINT.test(t)) return { intent: "ask_hint" };
  const hasEquals = /=/.test(t) && !/\?/.test(t);
  if (hasEquals && (CLAIM.test(t) || (t.length <= 120 && MATHY.test(t)))) return { intent: "student_work" };
  return null;
}

export type Route =
  | { kind: "submit_problem" }
  | { kind: "chip" }
  | { kind: "next_step" }
  | { kind: "hint" }
  | { kind: "check_work" }
  | { kind: "answer"; stepRef?: number };

/** What the server does with a classified message. Pure, so it's easy to test. */
export function decideRoute(intent: Intent, ctx: { hasProblem: boolean; mode: "normal" | "new_problem" | "my_work"; stepRef?: number }): Route {
  if (ctx.mode === "new_problem") return { kind: "submit_problem" };
  if (ctx.mode === "my_work") return ctx.hasProblem ? { kind: "check_work" } : { kind: "answer" };
  switch (intent) {
    case "new_problem":
      // The first problem-like message becomes the problem; after that, always ask.
      return ctx.hasProblem ? { kind: "chip" } : { kind: "submit_problem" };
    case "ask_next_step":
      return ctx.hasProblem ? { kind: "next_step" } : { kind: "answer" };
    case "ask_hint":
      return ctx.hasProblem ? { kind: "hint" } : { kind: "answer" };
    case "student_work":
      return ctx.hasProblem ? { kind: "check_work" } : { kind: "answer" };
    default:
      return { kind: "answer", stepRef: ctx.stepRef };
  }
}
