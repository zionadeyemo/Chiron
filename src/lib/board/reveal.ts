import type { SolutionPlan, WhiteboardState } from "./types";

// Pure whiteboard transitions. Each returns a new state; none reveals more than one step.

export class BoardError extends Error {}

/** Check-for-understanding questions: at most one open at a time, no more often than every 3 steps. */
export const CHECK_SPACING = 3;

const touch = (b: WhiteboardState): WhiteboardState => ({ ...b, updatedAt: new Date().toISOString() });

export function activate(board: WhiteboardState, stepIndex: number): WhiteboardState {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= board.revealedCount) throw new BoardError("That step isn't on the board yet.");
  return touch({ ...board, activeStepIndex: stepIndex });
}

export interface NextResult {
  board: WhiteboardState;
  revealedIndex: number;
  checkShown: boolean;
  completed: boolean;
}

export function nextStep(plan: SolutionPlan | null, board: WhiteboardState): NextResult {
  if (!plan) throw new BoardError("Still working through the problem — the next step will be ready in a moment.");
  if (board.revealedCount >= plan.steps.length) throw new BoardError("That's the whole solution.");
  const index = board.revealedCount;
  const step = plan.steps[index];
  const next: WhiteboardState = {
    ...board,
    revealedCount: index + 1,
    activeStepIndex: index,
    hintLevelForNextStep: 0,
  };
  // An answered or dismissed check question clears when the student moves on.
  if (next.activeCheck?.feedback) next.activeCheck = null;
  let checkShown = false;
  if (step.checkQuestion && !next.activeCheck && index - board.lastCheckStep >= CHECK_SPACING) {
    next.activeCheck = { stepIndex: index };
    next.lastCheckStep = index;
    checkShown = true;
  }
  const completed = index + 1 >= plan.steps.length;
  if (completed && !next.completed) next.completed = "reveal";
  return { board: touch(next), revealedIndex: index, checkShown, completed };
}

export interface HintResult {
  board: WhiteboardState;
  /** null when both hints are already shown: offer Next step instead. */
  level: 1 | 2 | null;
  stepIndex: number;
}

export function hint(plan: SolutionPlan | null, board: WhiteboardState): HintResult {
  if (!plan) throw new BoardError("Still working through the problem — hints will be ready in a moment.");
  const stepIndex = board.revealedCount;
  if (stepIndex >= plan.steps.length) throw new BoardError("That's the whole solution — there's no next step to hint at.");
  if (board.hintLevelForNextStep >= 2) return { board, level: null, stepIndex };
  const level = (board.hintLevelForNextStep + 1) as 1 | 2;
  return { board: touch({ ...board, hintLevelForNextStep: level }), level, stepIndex };
}

export function gotIt(board: WhiteboardState): WhiteboardState {
  return touch({ ...board, studentMode: "independent" });
}

export function resumeGuidance(board: WhiteboardState): WhiteboardState {
  return touch({ ...board, studentMode: "guided" });
}

export function fillScaffold(plan: SolutionPlan | null, board: WhiteboardState, stepIndex: number): WhiteboardState {
  const step = plan?.steps[stepIndex];
  if (!step || stepIndex >= board.revealedCount || step.kind !== "scaffold") throw new BoardError("Nothing to fill in there.");
  if (board.filledScaffolds.includes(stepIndex)) return board;
  return touch({ ...board, filledScaffolds: [...board.filledScaffolds, stepIndex] });
}

export function dismissCheck(board: WhiteboardState): WhiteboardState {
  return touch({ ...board, activeCheck: null });
}

/**
 * The student's checked line matched step `index`: make it active, and if they're ahead of the
 * board, mark the steps up to it revealed (they've done them).
 */
export function positionAt(plan: SolutionPlan, board: WhiteboardState, index: number): WhiteboardState {
  const revealedCount = Math.max(board.revealedCount, index + 1);
  const completed = revealedCount >= plan.steps.length ? (board.completed ?? "student") : board.completed;
  return touch({
    ...board,
    revealedCount,
    activeStepIndex: index,
    hintLevelForNextStep: revealedCount > board.revealedCount ? 0 : board.hintLevelForNextStep,
    completed,
  });
}
