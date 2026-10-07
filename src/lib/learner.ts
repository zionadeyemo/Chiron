// Conservative learner-model rules. Evidence strength: student > feedback > profile > model.

import type { ConceptSource, ConceptState, FeedbackKind, KnowledgeState } from "./types";

export const normConcept = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);

const STRENGTH: Record<ConceptSource, number> = { student: 3, feedback: 2, profile: 1, model: 0 };

export interface KnowledgeUpdate {
  concept: string;
  state: ConceptState;
  evidence: string;
}

export interface AppliedUpdate {
  concept: string;
  from: ConceptState | null;
  to: ConceptState;
}

const MAX_MODEL_UPDATES_PER_TURN = 2;

/**
 * Apply the model's proposed updates. The model never overrides a student or feedback
 * entry, can't promote anything straight to "known" in one step, and can only nudge a
 * profile-declared "known" down to "learning".
 */
export function applyModelUpdates(knowledge: KnowledgeState, updates: KnowledgeUpdate[]): AppliedUpdate[] {
  const applied: AppliedUpdate[] = [];
  const now = new Date().toISOString();
  for (const u of updates) {
    if (applied.length >= MAX_MODEL_UPDATES_PER_TURN) break;
    const name = normConcept(u.concept);
    if (!name) continue;
    const existing = knowledge[name];
    if (existing && STRENGTH[existing.source] >= STRENGTH.feedback) continue;

    let to = u.state;
    if (to === "known" && existing?.state !== "learning") to = "learning";
    if (existing?.source === "profile" && existing.state === "known" && to === "uncertain") to = "learning";
    if (existing?.state === to) continue;

    knowledge[name] = { state: to, source: "model", updatedAt: now };
    applied.push({ concept: name, from: existing?.state ?? null, to });
  }
  return applied;
}

/**
 * Depth feedback is evidence about the concepts the answer leaned on:
 * "too much" on an answer that explained a shaky concept → they know it better than assumed;
 * "too little" on an answer that assumed a concept → they know it less well than assumed.
 */
export function applyFeedbackEvidence(
  knowledge: KnowledgeState,
  concepts: string[],
  kind: FeedbackKind,
): AppliedUpdate[] {
  const applied: AppliedUpdate[] = [];
  const now = new Date().toISOString();
  for (const raw of concepts) {
    const name = normConcept(raw);
    const existing = knowledge[name];
    if (!existing || existing.source === "student") continue;
    let to: ConceptState | null = null;
    if (kind === "too_much" && existing.state === "uncertain") to = "learning";
    if (kind === "too_little" && existing.state === "known") to = "learning";
    if (!to) continue;
    knowledge[name] = { state: to, source: "feedback", updatedAt: now };
    applied.push({ concept: name, from: existing.state, to });
  }
  return applied;
}

/** Student edits always win. `state: null` removes the concept. */
export function applyStudentEdit(knowledge: KnowledgeState, concept: string, state: ConceptState | null) {
  const name = normConcept(concept);
  const from = knowledge[name]?.state ?? null;
  if (state === null) delete knowledge[name];
  else knowledge[name] = { state, source: "student", updatedAt: new Date().toISOString() };
  return { concept: name, from, to: state };
}

export function conceptsByState(knowledge: KnowledgeState) {
  const out: Record<ConceptState, string[]> = { known: [], learning: [], uncertain: [] };
  for (const [name, entry] of Object.entries(knowledge)) out[entry.state].push(name);
  return out;
}

/** Keeps the most recent concepts in play, newest last, capped. */
export function mergeRelevant(current: string[], detected: string[], cap = 8): string[] {
  const merged = [...current];
  for (const raw of detected) {
    const name = normConcept(raw);
    if (!name) continue;
    const i = merged.indexOf(name);
    if (i >= 0) merged.splice(i, 1);
    merged.push(name);
  }
  return merged.slice(-cap);
}
