// Deterministic depth controller. The model proposes; this decides the target.
//
//   Level 1 — hint or direct clarification
//   Level 2 — short explanation
//   Level 3 — worked reasoning
//   Level 4 — deep conceptual explanation

import type { DepthStyle, FeedbackKind, StudySession, Turn, UserProfile } from "./types";

export const LEVEL_NAMES: Record<number, string> = {
  1: "hint / direct clarification",
  2: "short explanation",
  3: "worked reasoning",
  4: "deep conceptual explanation",
};

/** Soft word budget per level. */
export const WORD_BUDGET: Record<number, number> = { 1: 30, 2: 60, 3: 120, 4: 220 };

export const MIN_SCORE = 1;
export const MAX_SCORE = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function styleToScore(style: DepthStyle): number {
  return style === "hints" ? 1.25 : style === "full" ? 3 : 1.75;
}

export const levelFromScore = (score: number) => clamp(Math.round(score), 1, 4);

export interface DepthTarget {
  level: number;
  maxWords: number;
  reason: string;
}

export function targetFor(session: StudySession, profile: UserProfile): DepthTarget {
  const level = levelFromScore(profile.depth.score);
  let maxWords = WORD_BUDGET[level];
  const reasons = [`depth preference ${profile.depth.score.toFixed(2)} → level ${level}`];
  if (session.shortenNext != null && session.shortenNext < maxWords) {
    maxWords = session.shortenNext;
    reasons.push(`the student marked the previous answer "too much": stay under ${maxWords} words`);
  }
  return { level, maxWords, reason: reasons.join("; ") };
}

export function explainMoreTarget(parent: Turn): DepthTarget {
  const level = clamp((parent.depth ?? 1) + 1, 1, 4);
  return {
    level,
    maxWords: WORD_BUDGET[level],
    reason: `the student pressed "Explain more" on a level-${parent.depth ?? 1} answer: go exactly one level deeper`,
  };
}

/**
 * Score change for a rating. Too much / too little move the default half a level;
 * "just right" pulls the default a quarter of the way toward the rated answer's depth.
 */
export function feedbackDelta(kind: FeedbackKind, turn: Turn, currentScore: number): number {
  if (kind === "too_much") return -0.5;
  if (kind === "too_little") return 0.5;
  if (turn.depth == null) return 0;
  return (turn.depth - currentScore) * 0.25;
}

export function applyScoreDelta(score: number, delta: number) {
  return clamp(Math.round((score + delta) * 100) / 100, MIN_SCORE, MAX_SCORE);
}

/** Word cap for the next answer after "too much": half the flagged answer. */
export function shortenAfterTooMuch(turn: Turn): number {
  return Math.max(8, Math.floor(turn.words * 0.5));
}

/** Words, counting each inline/display math span as one word. */
export function countWords(text: string): number {
  const stripped = text.replace(/\$\$[\s\S]*?\$\$/g, " M ").replace(/\$[^$\n]+\$/g, " M ");
  return stripped.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
