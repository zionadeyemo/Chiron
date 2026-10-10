import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeProblem } from "../../../test/helpers";
import { hintLeaks, matchesKnownAnswer } from "./answers";
import { PlannerOut } from "./llm-schemas";
import { planFromOutput, qualityIssues } from "./planner";

// The six fixture problems: their reference plans must pass the verifier, match the known
// answers, and keep hints free of results. (The live Planner is evaluated by scripts/eval-planner.ts.)

const dir = path.resolve(__dirname, "../../../fixtures/problems");
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

describe("fixture problems", () => {
  it("has the six required problem types", () => {
    expect(fixtures.map((f) => f.id)).toEqual([
      "01-beam-determinate",
      "02-propped-cantilever",
      "03-linear-system",
      "04-definite-integral",
      "05-first-order-ode",
      "06-conceptual-deflection",
    ]);
  });

  for (const f of fixtures) {
    describe(f.id, () => {
      const problem = makeProblem({ statement: f.statement, setup: f.setup });
      const out = PlannerOut.parse(f.referencePlan);
      const plan = planFromOutput(problem, out);

      it("reference plan passes every check", () => {
        expect(plan.failedChecks).toEqual([]);
        expect(plan.status).toBe("verified");
      });

      it("matches the known answer", () => {
        const r = matchesKnownAnswer(plan, f.knownAnswer);
        expect(r.details.join("\n"), r.details.join("\n")).toBeTruthy();
        expect(r.ok).toBe(true);
      });

      it("has real teaching on every step (no placeholder titles or hints)", () => {
        expect(qualityIssues(plan)).toEqual([]);
      });

      it("hints never state the step's result", () => {
        for (const step of plan.steps) expect(hintLeaks(step, f.statement)).toBeNull();
      });

      it("uses check questions sparingly (at most one in three steps)", () => {
        const withCheck = plan.steps.filter((s) => s.checkQuestion).length;
        expect(withCheck).toBeLessThanOrEqual(Math.ceil((plan.steps.length - 1) / 3));
      });
    });
  }

  it("flags placeholder teaching", () => {
    const f = fixtures[0];
    const plan = planFromOutput(makeProblem({ statement: f.statement, setup: f.setup }), PlannerOut.parse(f.referencePlan));
    plan.steps[1] = { ...plan.steps[1], title: "Standard processing applied", hints: ["Standard processing applied.", "Standard processing applied."] };
    const issues = qualityIssues(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0].stepIndex).toBe(1);
    expect(issues[0].detail).toMatch(/placeholder/);
  });

  it("the propped cantilever fixture has a scaffold-free plan and the linear system has a scaffold", () => {
    const sys = fixtures.find((f) => f.id === "03-linear-system");
    expect(sys.referencePlan.steps[0].kind).toBe("scaffold");
    expect(sys.referencePlan.steps[0].scaffoldLatex).toContain("\\blank");
  });
});
