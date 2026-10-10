import { describe, expect, it } from "vitest";
import { makeBoard, makePlan, makeProblem, makeStep } from "../../../test/helpers";
import { project } from "./project";

describe("project — what the client may see", () => {
  const problem = makeProblem();

  it("includes only revealed steps; nothing from unrevealed steps leaks", () => {
    const plan = makePlan(problem, 5);
    const json = JSON.stringify(project(problem, plan, makeBoard(problem, { revealedCount: 2 })));
    expect(json).toContain("TITLE_1");
    expect(json).toContain("LATEX_1");
    for (const i of [2, 3, 4]) {
      for (const marker of [`TITLE_${i}`, `LATEX_${i}`, `RATIONALE_${i}`, `HINTONE_${i}`, `HINTTWO_${i}`, `x${i} = `]) {
        expect(json).not.toContain(marker);
      }
    }
  });

  it("never sends the method, final answer, solution values or verification specs", () => {
    const plan = makePlan(problem, 3);
    const json = JSON.stringify(project(problem, plan, makeBoard(problem, { revealedCount: 3 })));
    for (const secret of ["METHOD_SECRET", "FINAL_SECRET", "SOLUTION_SECRET", "RATIONALE_", "1+1", "resultEquation"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("sends hints for the upcoming step only as far as the student has asked", () => {
    const plan = makePlan(problem, 4);
    const none = project(problem, plan, makeBoard(problem, { revealedCount: 2, hintLevelForNextStep: 0 }));
    expect(none.hints).toEqual([]);
    const one = project(problem, plan, makeBoard(problem, { revealedCount: 2, hintLevelForNextStep: 1 }));
    expect(one.hints).toEqual(["HINTONE_2"]);
    expect(JSON.stringify(one)).not.toContain("HINTTWO_2");
    const two = project(problem, plan, makeBoard(problem, { revealedCount: 2, hintLevelForNextStep: 2 }));
    expect(two.hints).toEqual(["HINTONE_2", "HINTTWO_2"]);
  });

  it("hides a scaffold step's full latex until the student asks to fill it in", () => {
    const plan = makePlan(problem, 3);
    plan.steps[1] = makeStep(1, { kind: "scaffold", latex: "FULL_MATRIX", scaffoldLatex: "PARTIAL_MATRIX" });
    const unfilled = project(problem, plan, makeBoard(problem, { revealedCount: 2 }));
    expect(unfilled.steps[1].latex).toBeUndefined();
    expect(unfilled.steps[1].scaffoldLatex).toBe("PARTIAL_MATRIX");
    expect(JSON.stringify(unfilled)).not.toContain("FULL_MATRIX");
    const filled = project(problem, plan, makeBoard(problem, { revealedCount: 2, filledScaffolds: [1] }));
    expect(filled.steps[1].latex).toBe("FULL_MATRIX");
  });

  it("shows the setup before a plan exists", () => {
    const view = project(problem, null, makeBoard(problem));
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0].kind).toBe("setup");
    expect(view.hasNextStep).toBe(false);
  });

  it("marks steps that failed verification", () => {
    const plan = makePlan(problem, 3);
    plan.steps[1] = makeStep(1, { verifyStatus: "failed" });
    expect(project(problem, plan, makeBoard(problem, { revealedCount: 2 })).steps[1].unverified).toBe(true);
  });
});
