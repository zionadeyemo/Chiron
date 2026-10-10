import type { ClientBoard, ClientStep, Problem, SolutionPlan, SolutionStep, WhiteboardState } from "./types";

// The only path from server state to what the client sees. Unrevealed steps — their latex,
// titles, hints, rationale, checks — never leave the server; neither does the final answer.

export function setupStep(problem: Problem): SolutionStep {
  return {
    index: 0,
    kind: "setup",
    title: "Setup",
    latex: "",
    rationale: "Write down what's given and what's asked before choosing a method.",
    hints: ["", ""],
    verification: [{ type: "none", reason: "setup" }],
    concepts: [],
    origin: "plan",
    verifyStatus: "conceptual",
    setup: problem.setup ?? { given: [], find: [], assumptions: [] },
  };
}

export function emptyBoard(problemId: string): WhiteboardState {
  return {
    problemId,
    planVersion: 0,
    revealedCount: 1,
    activeStepIndex: 0,
    studentMode: "guided",
    hintLevelForNextStep: 0,
    studentLines: [],
    filledScaffolds: [],
    activeCheck: null,
    lastCheckStep: -10,
    completed: null,
    updatedAt: new Date().toISOString(),
  };
}

function toClientStep(step: SolutionStep, board: WhiteboardState): ClientStep {
  const isScaffold = step.kind === "scaffold" && !!step.scaffoldLatex;
  const filled = !isScaffold || board.filledScaffolds.includes(step.index);
  return {
    index: step.index,
    kind: step.kind,
    title: step.title,
    latex: filled ? step.latex : undefined,
    scaffoldLatex: isScaffold ? step.scaffoldLatex : undefined,
    filled,
    setup: step.setup,
    origin: step.origin,
    unverified: step.verifyStatus === "failed",
    checkQuestion: board.activeCheck?.stepIndex === step.index ? step.checkQuestion : undefined,
  };
}

export function project(problem: Problem, plan: SolutionPlan | null, board: WhiteboardState): ClientBoard {
  const steps = plan ? plan.steps : problem.setup ? [setupStep(problem)] : [];
  const revealed = steps.slice(0, Math.min(board.revealedCount, steps.length));
  const upcoming = plan ? plan.steps[board.revealedCount] : undefined;
  return {
    problem: {
      id: problem.id,
      title: problem.title,
      statement: problem.statement,
      source: problem.source,
      imageRef: problem.imageRef,
      pdfRef: problem.pdfRef,
      status: problem.status,
      planError: problem.planError,
    },
    planStatus: plan?.status ?? null,
    planVersion: board.planVersion,
    steps: revealed.map((s) => toClientStep(s, board)),
    hasNextStep: !!upcoming,
    hints: upcoming ? upcoming.hints.slice(0, board.hintLevelForNextStep) : [],
    hintLevel: board.hintLevelForNextStep,
    activeStepIndex: Math.min(board.activeStepIndex, Math.max(0, revealed.length - 1)),
    studentMode: board.studentMode,
    studentLines: board.studentLines,
    activeCheck: board.activeCheck,
    completed: board.completed,
  };
}
