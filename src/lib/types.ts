// Domain model shared by server and client. Plain JSON-serialisable shapes only.

/** Task label before the student has marked a problem in uploaded material. */
export const UNMARKED_TASK = "No problem marked yet";

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
  /** Continuous 1.0–4.0. Target level = round(score). Moved by depth feedback. */
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
  knowledge: KnowledgeState;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  name: string;
}

export type DocumentKind = "demo" | "pdf" | "screenshot";

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

export interface Location {
  documentId: string;
  /** 1-based page index within the document. */
  page: number;
}

export interface CurrentTask {
  /** Short label shown in the strip, e.g. "Problem 7.18 — Propped cantilever". */
  label: string;
  /** Problem statement, if we have it as text (authored material or a selection). */
  text?: string;
  documentId?: string;
  page?: number;
  setBy: "seed" | "student" | "model";
}

export interface SideQuestion {
  question: string;
  openedAt: string;
  turnId: string;
}

export type SourceType = "material" | "inference" | "general";
export interface Source {
  type: SourceType;
  ref: string;
}

export type FeedbackKind = "too_much" | "just_right" | "too_little";

export interface MathCall {
  tool: string;
  input: unknown;
  output: string;
  ok: boolean;
}

export interface StudentClaim {
  claim: string;
  verdict: "correct" | "incorrect" | "partly_correct" | "unverifiable";
}

export interface Turn {
  id: string;
  at: string;
  kind: "ask" | "explain_more";
  question: string;
  pointingAt?: string;
  parentTurnId?: string;
  response: string;
  /** Depth the model says it answered at (null in baseline). */
  depth: number | null;
  targetDepth: number | null;
  wordBudget: number | null;
  words: number;
  sources: Source[];
  /** True only if a math tool actually ran without error this turn. */
  verified: boolean;
  mathCalls: MathCall[];
  studentClaim: StudentClaim | null;
  sideQuestion: "open" | "close" | "none";
  inSideQuestion: boolean;
  detectedConcepts: string[];
  feedback: FeedbackKind | null;
  /** Score delta applied by this turn's feedback, so a changed rating can be reverted. */
  feedbackDelta: number;
  flagged: boolean;
  latencyMs: number;
  mock?: boolean;
}

export interface StudySession {
  id: string;
  mode: Mode;
  profileId: string;
  course: Course;
  documentIds: string[];
  location: Location;
  task: CurrentTask;
  step: string;
  sideQuestion: SideQuestion | null;
  /** Concepts recently in play — drives "assuming you know" in the strip. */
  relevantConcepts: string[];
  /** Hard word cap for the next answer after a "Too much" (null = none). */
  shortenNext: number | null;
  turns: Turn[];
  isDemo: boolean;
  startedAt: string;
  lastActiveAt: string;
}

export interface SessionBundle {
  session: StudySession;
  profile: UserProfile;
  documents: DocumentMeta[];
}
