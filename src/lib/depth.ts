// Depth of chat explanations (separate from whiteboard step size).
//
//   Level 1 — hint or direct clarification
//   Level 2 — short explanation
//   Level 3 — worked reasoning
//   Level 4 — deep conceptual explanation

import type { DepthStyle } from "./types";

export const LEVEL_NAMES: Record<number, string> = {
  1: "hint / direct clarification",
  2: "short explanation",
  3: "worked reasoning",
  4: "deep conceptual explanation",
};

/** Soft word budget per level. */
export const WORD_BUDGET: Record<number, number> = { 1: 30, 2: 60, 3: 120, 4: 220 };

export function styleToScore(style: DepthStyle): number {
  return style === "hints" ? 1.25 : style === "full" ? 3 : 1.75;
}

/** Words, counting each inline/display math span as one word. */
export function countWords(text: string): number {
  const stripped = text.replace(/\$\$[\s\S]*?\$\$/g, " M ").replace(/\$[^$\n]+\$/g, " M ");
  return stripped.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
