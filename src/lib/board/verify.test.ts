import { describe, expect, it } from "vitest";
import { makePlan, makeProblem, makeStep } from "../../../test/helpers";
import { checkEquivalence, checkNumeric, equationsMatch, holdsUnder, matchValue, verifyPlan, verifyStep } from "./verify";

describe("numeric checks", () => {
  it("passes a correct value", () => {
    expect(checkNumeric({ expr: "(12*2 + 18*3)/6", expected: 13 }).ok).toBe(true);
  });
  it("fails a wrong value and says what it got", () => {
    const r = checkNumeric({ expr: "(12*2 + 18*3)/6", expected: 15 });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/evaluates to 13, expected 15/);
  });
  it("handles mathjs units, converting to the stated unit", () => {
    expect(checkNumeric({ expr: "3 kN/m * 6 m", expected: 18, units: "kN" }).ok).toBe(true);
    expect(checkNumeric({ expr: "3 kN/m * 6 m", expected: 18000, units: "N" }).ok).toBe(true);
    expect(checkNumeric({ expr: "3 kN/m * 6 m", expected: 18, units: "N" }).ok).toBe(false);
  });
  it("uses relative tolerance by default and honours an explicit one", () => {
    expect(checkNumeric({ expr: "1e6 + 0.5", expected: 1e6 }).ok).toBe(true); // within 1e-6 relative
    expect(checkNumeric({ expr: "1.04", expected: 1, tolerance: 0.05 }).ok).toBe(true);
    expect(checkNumeric({ expr: "1.06", expected: 1, tolerance: 0.05 }).ok).toBe(false);
  });
  it("checks a definite integral independently (nint)", () => {
    expect(checkNumeric({ expr: "nint('x*exp(x)', x, 0, 1)", expected: 1 }).ok).toBe(true);
    expect(checkNumeric({ expr: "nint('x*exp(x)', x, 0, 1)", expected: Math.E - 1 }).ok).toBe(false);
  });
  it("records parse errors as failures, never as passes", () => {
    const r = checkNumeric({ expr: "3 * (4 +", expected: 12 });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/couldn't evaluate/);
  });
});

describe("equivalence checks", () => {
  it("passes a correct algebraic identity", () => {
    expect(checkEquivalence({ lhs: "(3*w*L/8)*L^3/(3*EI)", rhs: "w*L^4/(8*EI)", variables: ["w", "L", "EI"] }).ok).toBe(true);
    expect(checkEquivalence({ lhs: "(a+b)^2", rhs: "a^2 + 2*a*b + b^2", variables: ["a", "b"] }).ok).toBe(true);
  });
  it("catches a sign flip", () => {
    const r = checkEquivalence({ lhs: "(a-b)^2", rhs: "a^2 + 2*a*b + b^2", variables: ["a", "b"] });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/≠/);
  });
  it("catches a missing factor", () => {
    expect(checkEquivalence({ lhs: "w*L^4/(8*EI)", rhs: "w*L^4/(EI)", variables: ["w", "L", "EI"] }).ok).toBe(false);
    expect(checkEquivalence({ lhs: "R_B*L^3/(3*EI)", rhs: "R_B*L^3/EI", variables: ["R_B", "L", "EI"] }).ok).toBe(false);
  });
  it("records a parse error as a failure", () => {
    const r = checkEquivalence({ lhs: "w*L^4/(8*EI", rhs: "1", variables: ["w"] });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/couldn't parse/);
  });
  it("retries points that are singular or undefined", () => {
    // sqrt(x-2) is only real for x ≥ 2; points below are skipped, not counted as failures.
    expect(checkEquivalence({ lhs: "sqrt(x-2)^2", rhs: "x-2", variables: ["x"] }).ok).toBe(true);
    expect(checkEquivalence({ lhs: "(x^2-1)/(x-1)", rhs: "x+1", variables: ["x"] }).ok).toBe(true);
  });
  it("fails when no valid point can be found", () => {
    const r = checkEquivalence({ lhs: "sqrt(-x)", rhs: "0", variables: ["x"] });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/valid sample points/);
  });
  it("checks an ODE solution by differentiating it (diff)", () => {
    // y = 2 - e^{-2t} solves y' + 2y = 4
    expect(checkEquivalence({ lhs: "diff('2 - exp(-2*t)', t) + 2*(2 - exp(-2*t))", rhs: "4", variables: ["t"] }).ok).toBe(true);
    expect(checkEquivalence({ lhs: "diff('2 - exp(-t)', t) + 2*(2 - exp(-t))", rhs: "4", variables: ["t"] }).ok).toBe(false);
  });
  it("treats e and pi as constants unless listed", () => {
    expect(checkEquivalence({ lhs: "exp(1)", rhs: "e", variables: [] }).ok).toBe(true);
    expect(checkEquivalence({ lhs: "sin(pi/2)", rhs: "1", variables: [] }).ok).toBe(true);
  });
  it("accepts common LaTeX-isms", () => {
    expect(checkEquivalence({ lhs: "\\frac{3 w L}{8}", rhs: "3*w*L/8", variables: ["w", "L"] }).ok).toBe(true); // mathjs reads "3 w L" as a product
    expect(checkEquivalence({ lhs: "\\frac{3*w*L}{8}", rhs: "3*w*L/8", variables: ["w", "L"] }).ok).toBe(true);
  });
});

describe("equations against the true solution", () => {
  const solution = { R_B: "3*w*L/8", R_A: "5*w*L/8", M_A: "w*L^2/8" };
  const unknowns = Object.keys(solution);

  it("holdsUnder accepts correct equations and rejects wrong ones", () => {
    expect(holdsUnder("R_B*L^3/(3*EI) = w*L^4/(8*EI)", solution).ok).toBe(true);
    expect(holdsUnder("R_A + R_B = w*L", solution).ok).toBe(true);
    expect(holdsUnder("R_A = w*L/2", solution).ok).toBe(false); // the symmetric mistake
    expect(holdsUnder("M_A + R_B*L - w*L^2/2 = 0", solution).ok).toBe(true);
    expect(holdsUnder("M_A - R_B*L + w*L^2/2 = 0", solution).ok).toBe(false); // sign error
  });

  it("equationsMatch recognises the same constraint in a different form", () => {
    expect(equationsMatch("R_B*L^3/(3*EI) = w*L^4/(8*EI)", "R_B = 3*w*L/8", unknowns)).toBe(true);
    expect(equationsMatch("2*R_A + 2*R_B = 2*w*L", "R_A + R_B - w*L = 0", unknowns)).toBe(true);
    expect(equationsMatch("R_A + R_B = w*L", "R_B = 3*w*L/8", unknowns)).toBe(false);
  });

  it("matchValue tells which unknown a bare expression equals", () => {
    expect(matchValue("3*w*L/8", solution)).toBe("R_B");
    expect(matchValue("w*L/2", solution)).toBeNull();
  });
});

describe("verifyPlan", () => {
  const problem = makeProblem();

  it("verifies steps whose checks pass and whose results agree with the solution", () => {
    const plan = makePlan(problem, 3, { solution: { x1: "1", x2: "2" } });
    const out = verifyPlan(plan);
    expect(out.status).toBe("verified");
    expect(out.steps.slice(1).every((s) => s.verifyStatus === "verified")).toBe(true);
  });

  it("marks a step with a wrong check as failed and the plan as partially verified", () => {
    const plan = makePlan(problem, 4, { solution: { x1: "1", x2: "2", x3: "3" } });
    plan.steps[2] = makeStep(2, { verification: [{ type: "numeric", expr: "2+2", expected: 5 }] });
    const out = verifyPlan(plan);
    expect(out.steps[2].verifyStatus).toBe("failed");
    expect(out.failedChecks[0].stepIndex).toBe(2);
    expect(out.status).toBe("partially_verified");
  });

  it("fails a math step that has no check", () => {
    const r = verifyStep(makeStep(1, { verification: [{ type: "none", reason: "trust me" }], resultEquation: undefined }), {});
    expect(r.status).toBe("failed");
    expect(r.failures[0]).toMatch(/no check/);
  });

  it("accepts a genuinely conceptual step with a reason", () => {
    const r = verifyStep(makeStep(1, { kind: "concept", verification: [{ type: "none", reason: "explains why" }], resultEquation: undefined }), {});
    expect(r.status).toBe("conceptual");
  });

  it("is unverified when most math steps fail", () => {
    const plan = makePlan(problem, 4, { solution: {} });
    for (const i of [1, 2, 3]) plan.steps[i] = makeStep(i, { verification: [{ type: "numeric", expr: "1", expected: 2 }], resultEquation: undefined });
    expect(verifyPlan(plan).status).toBe("unverified");
  });
});

describe("equations written as equivalence checks", () => {
  it("accepts an equilibrium equation that holds at the true solution, and still rejects a wrong one", () => {
    const solution = { R_B: "13", R_A: "17", P: "12", w: "3", L: "6" };
    const ok = makeStep(1, { verification: [{ type: "equivalence", lhs: "R_B*L - P*2 - w*L*(L/2)", rhs: "0", variables: ["R_B", "L", "P", "w"] }], resultEquation: undefined });
    expect(verifyStep(ok, solution).status).toBe("verified");
    const wrong = makeStep(1, { verification: [{ type: "equivalence", lhs: "R_B*L + P*2 - w*L*(L/2)", rhs: "0", variables: ["R_B", "L", "P", "w"] }], resultEquation: undefined });
    expect(verifyStep(wrong, solution).status).toBe("failed");
  });
});

describe("intermediate definitions", () => {
  it("treats 'mu = exp(2*t)' as a definition later steps can use", () => {
    const problem = makeProblem();
    const plan = makePlan(problem, 4, { solution: { y: "2 - exp(-2*t)", C: "-1" } });
    plan.steps[1] = makeStep(1, { verification: [{ type: "equivalence", lhs: "diff('exp(2*t)', t)", rhs: "2*exp(2*t)", variables: ["t"] }], resultEquation: "mu = exp(2*t)" });
    plan.steps[2] = makeStep(2, { verification: [{ type: "equivalence", lhs: "diff('2*exp(2*t)', t)", rhs: "4*exp(2*t)", variables: ["t"] }], resultEquation: "mu*y = 2*mu + C" });
    plan.steps[3] = makeStep(3, { verification: [{ type: "numeric", expr: "1 - 2", expected: -1 }], resultEquation: "C = -1" });
    const out = verifyPlan(plan);
    expect(out.failedChecks).toEqual([]);
    expect(out.status).toBe("verified");
  });
});

describe("equation syntax from models", () => {
  it("reads mathjs == as an equation", () => {
    const solution = { R_A: "17", R_B: "13" };
    expect(holdsUnder("6 * R_B + 12 * 2 + 18 * 3 == 0", solution).ok).toBe(false);
    expect(holdsUnder("6 * R_B - 12 * 2 - 18 * 3 == 0", solution).ok).toBe(true);
  });
});

describe("calculus helpers with unquoted expressions", () => {
  it("diff(exp(x), x) differentiates the expression, not its value", () => {
    expect(checkEquivalence({ lhs: "diff(exp(x), x)", rhs: "exp(x)", variables: ["x"] }).ok).toBe(true);
    expect(checkEquivalence({ lhs: "diff(x^2, x)", rhs: "2*x", variables: ["x"] }).ok).toBe(true);
  });
});

describe("solution values inside quoted calculus expressions", () => {
  it("substitutes into diff('…', t) strings", () => {
    const solution = { y: "2 - exp(-2*t)", C: "-1" };
    expect(holdsUnder("diff('exp(2*t)*y', t) = 4*exp(2*t)", solution).ok).toBe(true);
    expect(holdsUnder("diff('exp(2*t)*y', t) = 2*exp(2*t)", solution).ok).toBe(false);
  });
});
