import type { SolutionPlan, SolutionStep } from "./types";
import { checkEquivalence, equationResidual } from "./verify";

// Checks used by the planner eval and fixture tests.

export interface AnswerCheck {
  ok: boolean;
  details: string[];
}

/** Does the plan's solution contain each known answer (as any symbol, by value)? */
export function matchesKnownAnswer(plan: SolutionPlan, known: { values: Record<string, string>; mustMention?: string[] }): AnswerCheck {
  const details: string[] = [];
  let ok = true;
  const entries = Object.entries(plan.solution);
  for (const [name, expected] of Object.entries(known.values)) {
    const bySymbol = plan.solution[name];
    const hit =
      (bySymbol && checkEquivalence({ lhs: bySymbol, rhs: expected, variables: [] }).ok && name) ||
      entries.find(([, v]) => checkEquivalence({ lhs: v, rhs: expected, variables: [] }).ok)?.[0] ||
      (typeof plan.finalAnswer.value === "number" && Object.keys(known.values).length === 1 && checkEquivalence({ lhs: String(plan.finalAnswer.value), rhs: expected, variables: [] }).ok && "finalAnswer.value");
    if (hit) details.push(`${name} = ${expected} ✓ (${hit})`);
    else {
      ok = false;
      details.push(`${name}: expected ${expected}, plan has ${bySymbol ?? "no matching value"}`);
    }
  }
  for (const phrase of known.mustMention ?? []) {
    const text = (plan.finalAnswer.latex + " " + plan.steps.at(-1)?.latex).toLowerCase();
    if (text.includes(phrase.toLowerCase())) details.push(`mentions "${phrase}" ✓`);
    else {
      ok = false;
      details.push(`final answer doesn't mention "${phrase}"`);
    }
  }
  return { ok, details };
}

export const squashForLeak = (s: string) => s.replace(/[\s{}$\\]|\\,|\\;/g, "").replace(/\*\*/g, "^").toLowerCase();

/**
 * Spot-check that a hint doesn't state its step's result: the result's right-hand side (as
 * written in resultEquation) or its numeric value must not appear in either hint.
 * Numbers that are already in the problem statement don't count.
 */
export function hintLeaks(step: SolutionStep, statement: string): string | null {
  if (!step.resultEquation || step.kind === "setup") return null;
  let rhs: string;
  try {
    const parts = step.resultEquation.split("=");
    if (parts.length !== 2) return null;
    equationResidual(step.resultEquation); // parseable
    rhs = parts[1].trim();
  } catch {
    return null;
  }
  const isZero = /^0(\.0+)?$/.test(rhs);
  for (const hint of step.hints) {
    const h = squashForLeak(hint);
    const r = squashForLeak(rhs);
    if (!isZero && r.length >= 2 && h.includes(r)) return `hint contains the result "${rhs}"`;
    const value = Number(rhs);
    // Single-digit integers are everywhere in hints ("row 1", "factor of 2"); skip them.
    const distinctive = Number.isFinite(value) && !isZero && (Math.abs(value) >= 10 || !Number.isInteger(value));
    if (distinctive) {
      const pattern = new RegExp(`(^|[^\\d.])${rhs.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?![\\d.])`);
      if (pattern.test(hint) && !pattern.test(statement)) return `hint contains the value ${rhs}`;
    }
  }
  return null;
}
