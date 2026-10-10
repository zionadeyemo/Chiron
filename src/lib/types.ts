// Shared types that survive from V0: the student profile, learner model and documents.
// Iteration-2 types (courses, problems, plans, whiteboard) live in ./board/types.ts.

export type Mode = "chiron" | "baseline";

export type ConceptState = "known" | "learning" | "uncertain";
/** Evidence strength, strongest first: student > feedback > profile > model. */
export type ConceptSource = "student" | "feedback" | "profile" | "model";

export interface ConceptEntry {
  state: ConceptState;
  source: ConceptSource;
  updatedAt: string;
}

/** concept name (lowercase) → state */
export type KnowledgeState = Record<string, ConceptEntry>;

export type DepthStyle = "hints" | "steps" | "full";

export interface DepthPreference {
  /** Continuous 1.0–4.0. Chat answers default to round(score). */
  score: number;
  style: DepthStyle;
}

export interface UserProfile {
  id: string;
  major: string;
  year: string;
  course: string;
  previousCourses: string[];
  comfortableWith: string;
  depth: DepthPreference;
  /** Planner step granularity: −2 (bigger steps) … +2 (smaller steps). From Too big / Too small. */
  stepSize?: number;
  knowledge: KnowledgeState;
  createdAt: string;
  updatedAt: string;
}

export type DocumentKind = "demo" | "pdf";

export interface DocumentMeta {
  id: string;
  kind: DocumentKind;
  title: string;
  pageCount: number;
  /** Printed page labels (e.g. "342") by 1-based page index, when known. */
  pageLabels?: string[];
  mimeType?: string;
  createdAt: string;
}

export interface MathCall {
  tool: string;
  input: unknown;
  output: string;
  ok: boolean;
}
