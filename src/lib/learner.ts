// Learner-model helpers. Evidence strength: student > feedback > profile > model.

import type { ConceptState, KnowledgeState } from "./types";

export const normConcept = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);

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
