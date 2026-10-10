import { describe, expect, it } from "vitest";
import { makeBoard, makePlan, makeProblem, makeStep } from "../../../test/helpers";
import { activate, BoardError, dismissCheck, gotIt, hint, nextStep, positionAt, resumeGuidance } from "./reveal";

const problem = makeProblem();

describe("reveal transitions", () => {
  it("Next step reveals exactly one step and makes it active", () => {
    const plan = makePlan(problem, 5);
    const r = nextStep(plan, makeBoard(problem, { revealedCount: 1 }));
    expect(r.board.revealedCount).toBe(2);
    expect(r.board.activeStepIndex).toBe(1);
    expect(r.revealedIndex).toBe(1);
  });

  it("Next step resets the hint level and completes on the last step", () => {
    const plan = makePlan(problem, 3);
    const r = nextStep(plan, makeBoard(problem, { revealedCount: 2, hintLevelForNextStep: 2 }));
    expect(r.board.hintLevelForNextStep).toBe(0);
    expect(r.completed).toBe(true);
    expect(r.board.completed).toBe("reveal");
    expect(() => nextStep(plan, r.board)).toThrow(BoardError);
  });

  it("Next step and Hint wait for the plan", () => {
    expect(() => nextStep(null, makeBoard(problem))).toThrow(BoardError);
    expect(() => hint(null, makeBoard(problem))).toThrow(BoardError);
  });

  it("Hint goes 1 → 2, then offers Next step without revealing anything", () => {
    const plan = makePlan(problem, 4);
    const a = hint(plan, makeBoard(problem, { revealedCount: 1 }));
    expect(a.level).toBe(1);
    expect(a.stepIndex).toBe(1);
    const b = hint(plan, a.board);
    expect(b.level).toBe(2);
    const c = hint(plan, b.board);
    expect(c.level).toBeNull();
    expect(c.board.revealedCount).toBe(1);
  });

  it("activate only accepts revealed steps", () => {
    const board = makeBoard(problem, { revealedCount: 3 });
    expect(activate(board, 1).activeStepIndex).toBe(1);
    expect(() => activate(board, 3)).toThrow(BoardError);
  });

  it("I got it / Resume guidance switch modes without changing what's revealed", () => {
    const board = makeBoard(problem, { revealedCount: 2 });
    const independent = gotIt(board);
    expect(independent.studentMode).toBe("independent");
    expect(independent.revealedCount).toBe(2);
    expect(resumeGuidance(independent).studentMode).toBe("guided");
  });

  it("shows at most one check question, no more often than every 3 steps", () => {
    const plan = makePlan(problem, 8);
    for (const i of [1, 2, 3, 5]) plan.steps[i] = makeStep(i, { checkQuestion: `CHECK_${i}` });
    let board = makeBoard(problem);
    const shown: number[] = [];
    for (let k = 0; k < 7; k++) {
      const r = nextStep(plan, board);
      if (r.checkShown) shown.push(r.revealedIndex);
      board = r.board;
      if (board.activeCheck) board = dismissCheck(board);
    }
    expect(shown).toEqual([1, 5]);
  });

  it("a checked line positions the board, revealing up to it when the student is ahead", () => {
    const plan = makePlan(problem, 5);
    const board = positionAt(plan, makeBoard(problem, { revealedCount: 2 }), 3);
    expect(board.revealedCount).toBe(4);
    expect(board.activeStepIndex).toBe(3);
    const behind = positionAt(plan, makeBoard(problem, { revealedCount: 4 }), 1);
    expect(behind.revealedCount).toBe(4);
    expect(behind.activeStepIndex).toBe(1);
    expect(positionAt(plan, makeBoard(problem, { revealedCount: 2 }), 4).completed).toBe("student");
  });
});
