// Iteration 2 domain model: courses, problems, solution plans and the whiteboard.
// Server-only shapes (SolutionPlan) are never sent to the client; the client gets ClientBoard.

import type { ConceptSource, ConceptState, DepthStyle, DocumentMeta, Mode } from "../types";

export interface Course {
  id: string;
  name: string;
  archived: boolean;
  /** Off: Planner and chat see only the course and problem, no learner model. */
  personalize: boolean;
  mode: Mode;
  activeProblemId: string | null;
  documentIds: string[];
  lastVisitId: string | null;
  /** Concepts on revealed or checked steps (topics covered). */
  topics?: string[];
  createdAt: string;
  lastOpenedAt: string;
}

/** The brief's "session": one sitting in a course. Events carry its id. */
export interface Visit {
  id: string;
  courseId: string;
  startedAt: string;
  lastActiveAt: string;
}

export type ProblemSource = "text" | "image" | "pdf";

/** Markdown lines with inline $math$. */
export interface Setup {
  given: string[];
  find: string[];
  assumptions: string[];
}

export interface Problem {
  id: string;
  courseId: string;
  sessionId: string;
  source: ProblemSource;
  title: string;
  statement: string;
  imageRef?: string;
  pdfRef?: { docId: string; page: number };
  setup: Setup | null;
  status: "planning" | "ready" | "failed";
  planError?: string;
  planStartedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type StepKind = "setup" | "equation" | "substitution" | "algebra" | "concept" | "scaffold" | "result";

export type VerificationSpec =
  | { type: "numeric"; expr: string; expected: number; tolerance?: number; units?: string }
  | { type: "equivalence"; lhs: string; rhs: string; variables: string[] }
  | { type: "none"; reason: string };

export interface SolutionStep {
  index: number; // 0 = setup
  kind: StepKind;
  title: string;
  latex: string;
  scaffoldLatex?: string;
  rationale: string;
  hints: [string, string];
  checkQuestion?: string;
  verification: VerificationSpec[];
  concepts: string[];
  /** The step's key result as a mathjs equation, used to position a student's checked line. */
  resultEquation?: string;
  /** Steps rebuilt from a student's alternative method are theirs. */
  origin: "plan" | "student";
  verifyStatus: "verified" | "failed" | "conceptual" | "unchecked";
  verifyDetail?: string;
  setup?: Setup;
}

export interface SolutionPlan {
  problemId: string;
  method: string;
  steps: SolutionStep[];
  finalAnswer: { latex: string; value?: number; units?: string };
  /** Every unknown expressed in the givens (mathjs). Lets the verifier judge any student equation. */
  solution: Record<string, string>;
  status: "verified" | "partially_verified" | "unverified";
  failedChecks: { stepIndex: number; detail: string }[];
  version: number;
  repairRounds: number;
  createdAt: string;
  latencyMs: number;
}

export type Verdict = "correct" | "incorrect" | "different_method" | "unclear";

export interface StudentLine {
  id: string;
  latexOrText: string;
  imageRef?: string;
  /** What Chiron read (for photos), so a misread can be corrected. */
  readAs?: string;
  verdict?: Verdict;
  feedback?: string;
  matchedStepIndex?: number;
  /** Rendered after this step on the board. */
  afterStepIndex: number;
  /** After a re-plan from the student's method, the line lives on the board as their own step. */
  absorbed?: boolean;
  createdAt: string;
}

export interface WhiteboardState {
  problemId: string;
  planVersion: number;
  revealedCount: number;
  activeStepIndex: number;
  studentMode: "guided" | "independent";
  hintLevelForNextStep: 0 | 1 | 2;
  studentLines: StudentLine[];
  filledScaffolds: number[];
  activeCheck: { stepIndex: number; answer?: string; feedback?: string } | null;
  /** Step index of the last check question shown (−∞ when none). */
  lastCheckStep: number;
  completed: null | "student" | "reveal";
  updatedAt: string;
}

export interface ChatChip {
  type: "new_problem";
  text: string;
  imageRefs: string[];
  resolved?: "yes" | "no";
}

export interface ChatMessage {
  id: string;
  role: "student" | "chiron";
  text: string;
  imageRefs?: string[];
  at: string;
  /** For Chiron: depth it answered at, and the turn it deepened. */
  depth?: number;
  explainMoreOf?: string;
  stepRef?: number | null;
  chip?: ChatChip;
  /** Composer mode the student used. */
  mode?: "normal" | "new_problem" | "my_work";
  mock?: boolean;
}

export interface Thread {
  id: string; // problem id, or "course:<courseId>" for questions with no problem
  courseId: string;
  messages: ChatMessage[];
}

// ── What the client sees ─────────────────────────────────────────────────────

export interface ClientStep {
  index: number;
  kind: StepKind;
  title: string;
  /** Absent for an unfilled scaffold step: only its scaffold is shown. */
  latex?: string;
  scaffoldLatex?: string;
  filled: boolean;
  setup?: Setup;
  origin: "plan" | "student";
  unverified: boolean;
  checkQuestion?: string;
}

export interface ClientProblemSummary {
  id: string;
  title: string;
  source: ProblemSource;
  createdAt: string;
  status: "in_progress" | "solved" | "independent";
}

export interface ClientBoard {
  problem: {
    id: string;
    title: string;
    statement: string;
    source: ProblemSource;
    imageRef?: string;
    pdfRef?: { docId: string; page: number };
    status: Problem["status"];
    planError?: string;
  };
  planStatus: SolutionPlan["status"] | null;
  planVersion: number;
  steps: ClientStep[];
  hasNextStep: boolean;
  /** Hints already shown for the upcoming step. */
  hints: string[];
  hintLevel: 0 | 1 | 2;
  activeStepIndex: number;
  studentMode: WhiteboardState["studentMode"];
  studentLines: StudentLine[];
  activeCheck: WhiteboardState["activeCheck"];
  completed: WhiteboardState["completed"];
}

export interface CourseSummary {
  course: Course;
  problemCount: number;
  status: Record<ClientProblemSummary["status"], number>;
  /** Visits (sittings) in this course. */
  sessions: number;
  lastActivity: string;
}

export interface WorkspaceView {
  course: Course;
  sessionId: string;
  problems: ClientProblemSummary[];
  board: ClientBoard | null;
  messages: ChatMessage[];
  documents: DocumentMeta[];
  /** "What Chiron assumes" — shown only when the student opens it. */
  assumptions: {
    concepts: { name: string; state: ConceptState; source: ConceptSource; inCourse: boolean }[];
    topics: string[];
    depthStyle: DepthStyle;
  };
}
