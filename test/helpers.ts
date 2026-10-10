import type { Problem, SolutionPlan, SolutionStep, WhiteboardState } from "@/lib/board/types";
import { emptyBoard, setupStep } from "@/lib/board/project";

export function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: "p_test00000000",
    courseId: "c_test00000000",
    sessionId: "v_test00000000",
    source: "text",
    title: "Test problem",
    statement: "A beam of length $L$ carries $w$. Find $R_B$.",
    setup: { given: ["$L$", "$w$"], find: ["$R_B$"], assumptions: [] },
    status: "ready",
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    ...overrides,
  };
}

/** Steps with distinctive markers, so tests can assert exactly what leaks and what doesn't. */
export function makeStep(index: number, overrides: Partial<SolutionStep> = {}): SolutionStep {
  return {
    index,
    kind: "equation",
    title: `TITLE_${index}`,
    latex: `LATEX_${index}`,
    rationale: `RATIONALE_${index}`,
    hints: [`HINTONE_${index}`, `HINTTWO_${index}`],
    verification: [{ type: "numeric", expr: "1+1", expected: 2 }],
    concepts: [`concept_${index}`],
    resultEquation: `x${index} = ${index}`,
    origin: "plan",
    verifyStatus: "verified",
    ...overrides,
  };
}

export function makePlan(problem: Problem, steps = 4, overrides: Partial<SolutionPlan> = {}): SolutionPlan {
  return {
    problemId: problem.id,
    method: "METHOD_SECRET",
    steps: [setupStep(problem), ...Array.from({ length: steps - 1 }, (_, i) => makeStep(i + 1))],
    finalAnswer: { latex: "FINAL_SECRET", value: 42 },
    solution: { R_B: "SOLUTION_SECRET" },
    status: "verified",
    failedChecks: [],
    version: 1,
    repairRounds: 0,
    createdAt: "2026-10-08T00:00:00.000Z",
    latencyMs: 1,
    ...overrides,
  };
}

export function makeBoard(problem: Problem, overrides: Partial<WhiteboardState> = {}): WhiteboardState {
  return { ...emptyBoard(problem.id), ...overrides };
}
