import { all, create, type MathNode } from "mathjs";
import type { SolutionPlan, SolutionStep, VerificationSpec } from "./types";

// The Verifier: checks every step's math with code, never "in its head".
// - numeric: evaluate and compare (relative 1e-6 / absolute 1e-9 by default; mathjs units supported)
// - equivalence: evaluate lhs − rhs at ≥5 random points, retrying points that are singular
// - equations: is an equation consistent with the true solution? Do two equations say the same thing?
// Parse failures are failures, never silent passes. Helpers in expressions:
//   nint('f(x)', x, a, b)  definite integral (adaptive Simpson)
//   diff('f(x)', x)        derivative, evaluated at the current point

const math = create(all);

export interface CheckResult {
  ok: boolean;
  detail: string;
}

const REQUIRED_POINTS = 5;
const MAX_ATTEMPTS = 60;
const REL = 1e-6;
const ABS = 1e-9;

// Names mathjs treats as constants. Not given random values unless explicitly listed as variables.
const CONSTANTS = new Set(["e", "pi", "i", "E", "PI", "Infinity", "NaN", "LN2", "LN10", "LOG2E", "LOG10E", "SQRT1_2", "SQRT2", "phi", "tau", "true", "false", "null"]);

// ── Helpers available inside checked expressions ───────────────────────────

type RawFn = ((args: MathNode[], m: typeof math, scope: Map<string, unknown>) => unknown) & { rawArgs?: boolean };

const scopeToObject = (scope: Map<string, unknown> | Record<string, unknown>): Record<string, unknown> => {
  if (scope instanceof Map) return Object.fromEntries(scope.entries());
  if (scope && typeof (scope as { keys?: unknown }).keys === "function" && typeof (scope as { get?: unknown }).get === "function") {
    const m = scope as unknown as { keys(): Iterable<string>; get(k: string): unknown };
    return Object.fromEntries([...m.keys()].map((k) => [k, m.get(k)]));
  }
  return { ...(scope as Record<string, unknown>) };
};

const nodeText = (node: MathNode, scope: Record<string, unknown>): string => {
  if (node.type === "ConstantNode") return String((node as unknown as { value: unknown }).value);
  if (node.type === "SymbolNode") return (node as unknown as { name: string }).name;
  // An unquoted expression argument, e.g. diff(exp(x), x): use it as an expression, not its value.
  void scope;
  return node.toString();
};

function simpson(f: (x: number) => number, a: number, b: number, eps: number, whole: number, fa: number, fb: number, fm: number, depth: number): number {
  const m = (a + b) / 2;
  const lm = (a + m) / 2;
  const rm = (m + b) / 2;
  const flm = f(lm);
  const frm = f(rm);
  const left = ((m - a) / 6) * (fa + 4 * flm + fm);
  const right = ((b - m) / 6) * (fm + 4 * frm + fb);
  if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
  return simpson(f, a, m, eps / 2, left, fa, fm, flm, depth - 1) + simpson(f, m, b, eps / 2, right, fm, fb, frm, depth - 1);
}

const nint: RawFn = (args, _m, rawScope) => {
  if (args.length !== 4) throw new Error("nint(f, x, a, b) takes 4 arguments");
  const scope = scopeToObject(rawScope);
  const f = math.compile(nodeText(args[0], scope));
  const v = nodeText(args[1], scope);
  const a = Number(args[2].evaluate(scope));
  const b = Number(args[3].evaluate(scope));
  const g = (x: number) => Number(f.evaluate({ ...scope, [v]: x }));
  const fa = g(a);
  const fb = g(b);
  const fm = g((a + b) / 2);
  return simpson(g, a, b, 1e-11, ((b - a) / 6) * (fa + 4 * fm + fb), fa, fb, fm, 40);
};
nint.rawArgs = true;

const diff: RawFn = (args, _m, rawScope) => {
  if (args.length !== 2) throw new Error("diff(f, x) takes 2 arguments");
  const scope = scopeToObject(rawScope);
  const d = math.derivative(nodeText(args[0], scope), nodeText(args[1], scope));
  return d.evaluate(scope);
};
diff.rawArgs = true;

math.import({ nint, diff } as never, { override: true });

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Accepts mathjs syntax; tolerates a few LaTeX-isms models and students produce. */
export function normalizeExpr(expr: string): string {
  return expr
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\left|\\right/g, "")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "(($1)/($2))")
    .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)")
    .replace(/\\(pi|sin|cos|tan|exp|ln|log)\b/g, "$1")
    .replace(/[{}]/g, (c) => (c === "{" ? "(" : ")"))
    .replace(/−/g, "-")
    .replace(/×|·/g, "*")
    .trim();
}

function parse(expr: string): MathNode {
  return math.parse(normalizeExpr(expr));
}

export function freeSymbols(node: MathNode): string[] {
  const names = new Set<string>();
  node.traverse((n, _path, parent) => {
    if (n.type !== "SymbolNode") return;
    const name = (n as unknown as { name: string }).name;
    const isFnName = parent?.type === "FunctionNode" && (parent as unknown as { fn: MathNode }).fn === n;
    // String arguments to nint/diff are not symbols; symbol args (the variable) are fine to skip.
    if (!isFnName) names.add(name);
  });
  return [...names];
}

/**
 * Symbols that need a value: everything that isn't a mathjs constant, plus anything listed.
 * Unit names count as variables here (L is a length, not litres); numeric checks, which never
 * assign values, are where mathjs units apply.
 */
function variablesOf(nodes: MathNode[], listed: string[] = []): string[] {
  const out = new Set(listed);
  for (const n of nodes) for (const s of freeSymbols(n)) if (!CONSTANTS.has(s)) out.add(s);
  return [...out];
}

// Seeded PRNG so results are reproducible run to run.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const close = (a: number, b: number, rel = REL, abs = ABS) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));

function toNumber(v: unknown, units?: string): number {
  if (typeof v === "number") return v;
  if (math.isUnit(v as never)) {
    const u = v as unknown as { toNumber(unit?: string): number };
    return units ? u.toNumber(units) : u.toNumber();
  }
  if (math.isBigNumber(v as never) || math.isFraction(v as never)) return Number(v);
  if (math.isComplex(v as never)) {
    const c = v as unknown as { re: number; im: number };
    if (Math.abs(c.im) > 1e-12) throw new Error("complex value");
    return c.re;
  }
  throw new Error(`not a number: ${String(v)}`);
}

/**
 * Evaluate f at ≥5 random points for `vars`, skipping points where it throws or isn't finite.
 * Values are drawn from [0.6, 3.1] — positive, away from zero, so physical quantities make sense.
 */
function samplePoints(vars: string[], seed: number, evaluate: (scope: Record<string, number>) => number[] | null): { ok: true; points: number } | { ok: false; detail: string } {
  const rand = rng(seed);
  let valid = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && valid < REQUIRED_POINTS * 2; attempt++) {
    const scope = Object.fromEntries(vars.map((v) => [v, 0.6 + 2.5 * rand()]));
    let values: number[] | null;
    try {
      values = evaluate(scope);
    } catch {
      continue; // singular or undefined here — try another point
    }
    if (values === null) continue;
    if (values.some((x) => !Number.isFinite(x))) continue;
    valid++;
  }
  if (valid < REQUIRED_POINTS) return { ok: false, detail: `couldn't find ${REQUIRED_POINTS} valid sample points (only ${valid})` };
  return { ok: true, points: valid };
}

// ── The three checks ─────────────────────────────────────────────────────────

export function checkNumeric(spec: { expr: string; expected: number; tolerance?: number; units?: string }): CheckResult {
  let value: number;
  try {
    value = toNumber(math.evaluate(normalizeExpr(spec.expr)), spec.units);
  } catch (e) {
    return { ok: false, detail: `couldn't evaluate "${spec.expr}": ${(e as Error).message}` };
  }
  if (!Number.isFinite(value)) return { ok: false, detail: `"${spec.expr}" is not finite` };
  const ok = spec.tolerance != null ? Math.abs(value - spec.expected) <= Math.abs(spec.tolerance) * Math.max(1, Math.abs(spec.expected)) : close(value, spec.expected);
  return { ok, detail: ok ? `${spec.expr} = ${fmt(value)}` : `${spec.expr} evaluates to ${fmt(value)}, expected ${fmt(spec.expected)}` };
}

export function checkEquivalence(spec: { lhs: string; rhs: string; variables: string[] }, seed = 7): CheckResult {
  let l: MathNode, r: MathNode;
  try {
    l = parse(spec.lhs);
    r = parse(spec.rhs);
  } catch (e) {
    return { ok: false, detail: `couldn't parse: ${(e as Error).message}` };
  }
  const vars = variablesOf([l, r], spec.variables);
  const cl = l.compile();
  const cr = r.compile();
  let counterexample: string | null = null;
  const sampled = samplePoints(vars, seed, (scope) => {
    const a = toNumber(cl.evaluate({ ...scope }));
    const b = toNumber(cr.evaluate({ ...scope }));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!counterexample && !close(a, b, 1e-7, 1e-10)) {
      counterexample = `at ${Object.entries(scope).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(", ")}: lhs=${fmt(a)}, rhs=${fmt(b)}`;
    }
    return [a, b];
  });
  if (!sampled.ok) return { ok: false, detail: sampled.detail };
  if (counterexample) return { ok: false, detail: `${spec.lhs} ≠ ${spec.rhs} (${counterexample})` };
  return { ok: true, detail: `${spec.lhs} ≡ ${spec.rhs} at ${sampled.points} points` };
}

export function checkSpec(spec: VerificationSpec): CheckResult {
  if (spec.type === "numeric") return checkNumeric(spec);
  if (spec.type === "equivalence") return checkEquivalence(spec);
  return { ok: true, detail: `conceptual: ${spec.reason}` };
}

const fmt = (x: number) => (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(6) : String(Math.round(x * 1e8) / 1e8));

// ── Equations (student lines, step results, the solution map) ──────────────

/** "a = b" → node for (a) − (b). A bare expression is returned as-is. */
export function equationResidual(eq: string): { node: MathNode; isEquation: boolean } {
  // Models sometimes write mathjs comparison (==) for an equation; it means the same thing here.
  const parts = normalizeExpr(eq).replace(/(?<![<>!])==(?!=)/g, "=").split(/(?<![<>!=])=(?!=)/);
  if (parts.length > 2) throw new Error(`more than one "=" in ${eq}`);
  if (parts.length === 2) return { node: math.parse(`(${parts[0]}) - (${parts[1]})`), isEquation: true };
  return { node: math.parse(parts[0]), isEquation: false };
}

function substitute(node: MathNode, values: Record<string, MathNode>): MathNode {
  return node.transform((n) => {
    if (n.type === "SymbolNode") {
      const name = (n as unknown as { name: string }).name;
      if (name in values) return new math.ParenthesisNode(values[name]);
    }
    // Quoted expressions inside diff('…', t) / nint('…', x, a, b) need the same substitution.
    const value = n.type === "ConstantNode" ? (n as unknown as { value: unknown }).value : undefined;
    if (typeof value === "string") {
      try {
        return new math.ConstantNode(substitute(math.parse(value), values).toString());
      } catch {
        return n;
      }
    }
    return n;
  });
}

function solutionNodes(solution: Record<string, string>): Record<string, MathNode> {
  return Object.fromEntries(Object.entries(solution).map(([k, v]) => [k, parse(v)]));
}

/** Does the equation hold once every unknown is replaced by its true value? */
export function holdsUnder(eq: string, solution: Record<string, string>, seed = 11): CheckResult {
  let residual: MathNode;
  try {
    const r = equationResidual(eq);
    if (!r.isEquation) return { ok: false, detail: `"${eq}" is not an equation` };
    // Definitions can refer to each other (mu = exp(2*t), then y*mu = …): substitute a few passes.
    const nodes = solutionNodes(solution);
    residual = r.node;
    for (let pass = 0; pass < 4; pass++) residual = substitute(residual, nodes);
  } catch (e) {
    return { ok: false, detail: `couldn't parse: ${(e as Error).message}` };
  }
  const vars = variablesOf([residual]);
  const compiled = residual.compile();
  let worst: string | null = null;
  const sampled = samplePoints(vars, seed, (scope) => {
    const v = toNumber(compiled.evaluate({ ...scope }));
    if (!Number.isFinite(v)) return null;
    // Compare against the scale of the solution values so "≈ 0" is meaningful.
    if (!worst && Math.abs(v) > 1e-7 * scaleAt(solution, scope)) worst = `residual ${fmt(v)}`;
    return [v];
  });
  if (!sampled.ok) return { ok: false, detail: sampled.detail };
  if (worst) return { ok: false, detail: `${eq} doesn't hold for the true solution (${worst})` };
  return { ok: true, detail: `${eq} holds for the true solution` };
}

function scaleAt(solution: Record<string, string>, scope: Record<string, number>): number {
  let s = 1;
  for (const v of Object.values(solution)) {
    try {
      s = Math.max(s, Math.abs(toNumber(math.evaluate(normalizeExpr(v), { ...scope }))));
    } catch {
      /* ignore */
    }
  }
  return s;
}

/**
 * Do two equations constrain the unknowns the same way? Their residuals must be proportional,
 * with a ratio that doesn't depend on the unknowns (it may depend on the givens: "R_B L^3/(3EI) =
 * wL^4/(8EI)" and "R_B = 3wL/8" match). Unknowns vary independently of the givens.
 */
export function equationsMatch(a: string, b: string, unknowns: string[], seed = 13): boolean {
  let ra: MathNode, rb: MathNode;
  try {
    const A = equationResidual(a);
    const B = equationResidual(b);
    if (!A.isEquation || !B.isEquation) return false;
    ra = A.node;
    rb = B.node;
  } catch {
    return false;
  }
  const givens = variablesOf([ra, rb]).filter((v) => !unknowns.includes(v));
  const ca = ra.compile();
  const cb = rb.compile();
  const rand = rng(seed);
  let agreeing = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && agreeing < REQUIRED_POINTS; attempt++) {
    const g = Object.fromEntries(givens.map((v) => [v, 0.6 + 2.5 * rand()]));
    const ratios: number[] = [];
    for (let k = 0; k < 2; k++) {
      const u = Object.fromEntries(unknowns.map((v) => [v, -3 + 6 * rand()]));
      try {
        const x = toNumber(ca.evaluate({ ...g, ...u }));
        const y = toNumber(cb.evaluate({ ...g, ...u }));
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) < 1e-9) break;
        ratios.push(x / y);
      } catch {
        break;
      }
    }
    if (ratios.length < 2) continue;
    if (Math.abs(ratios[0]) < 1e-12 || !close(ratios[0], ratios[1], 1e-6, 1e-12)) return false;
    agreeing++;
  }
  return agreeing >= REQUIRED_POINTS;
}

/** A bare expression the student wrote: which unknown's true value is it, if any? */
export function matchValue(expr: string, solution: Record<string, string>, seed = 17): string | null {
  for (const [symbol, value] of Object.entries(solution)) {
    if (checkEquivalence({ lhs: expr, rhs: value, variables: [] }, seed).ok) return symbol;
  }
  return null;
}

/** Variable symbols used across expressions/equations (constants excluded). Unparseable input is skipped. */
export function symbolsOf(exprs: string[]): Set<string> {
  const out = new Set<string>();
  for (const e of exprs) {
    try {
      for (const s of variablesOf([equationResidual(e).node])) out.add(s);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Variable symbols in one line, or null if it doesn't parse. */
export function lineSymbols(line: string): string[] | null {
  try {
    return variablesOf([equationResidual(line).node]);
  } catch {
    return null;
  }
}

// ── Whole plans ──────────────────────────────────────────────────────────────

const MATH_KINDS = new Set<SolutionStep["kind"]>(["equation", "substitution", "algebra", "scaffold", "result"]);

export function verifyStep(step: SolutionStep, solution: Record<string, string>): { status: SolutionStep["verifyStatus"]; failures: string[] } {
  if (step.kind === "setup") return { status: "conceptual", failures: [] };
  const failures: string[] = [];
  const real = step.verification.filter((v) => v.type !== "none");
  for (const spec of real) {
    const r = checkSpec(spec);
    if (r.ok) continue;
    // An equation like ΣM = 0 isn't an identity: it holds at the true solution. Accept it if it does.
    if (spec.type === "equivalence" && Object.keys(solution).length && holdsUnder(`${spec.lhs} = ${spec.rhs}`, solution).ok) continue;
    failures.push(r.detail);
  }
  if (step.resultEquation && Object.keys(solution).length) {
    const r = holdsUnder(step.resultEquation, solution);
    if (!r.ok) failures.push(`result: ${r.detail}`);
  }
  if (!real.length && MATH_KINDS.has(step.kind)) failures.push("this step contains math but has no check");
  if (failures.length) return { status: "failed", failures };
  return { status: real.length || step.resultEquation ? "verified" : "conceptual", failures };
}

/** "X = expr" where X is a new plain symbol: a definition (e.g. mu = exp(2*t)), not a claim to test. */
function definition(eq: string | undefined, known: Record<string, string>): [string, string] | null {
  if (!eq) return null;
  const parts = eq.split("=");
  if (parts.length !== 2) return null;
  const name = parts[0].trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || name in known || CONSTANTS.has(name)) return null;
  try {
    parse(parts[1]);
  } catch {
    return null;
  }
  return [name, parts[1].trim()];
}

export function verifyPlan(plan: SolutionPlan): SolutionPlan {
  const failedChecks: SolutionPlan["failedChecks"] = [];
  // Steps are checked in order; intermediate definitions become available to later steps.
  const defs: Record<string, string> = { ...plan.solution };
  const steps = plan.steps.map((step) => {
    const def = definition(step.resultEquation, defs);
    if (def) defs[def[0]] = def[1];
    const { status, failures } = verifyStep(def ? { ...step, resultEquation: undefined } : step, defs);
    for (const detail of failures) failedChecks.push({ stepIndex: step.index, detail });
    return { ...step, verifyStatus: status, verifyDetail: failures.join("; ") || undefined };
  });
  const mathSteps = steps.filter((s) => s.verifyStatus === "verified" || s.verifyStatus === "failed");
  const failed = steps.filter((s) => s.verifyStatus === "failed").length;
  const status: SolutionPlan["status"] = failed === 0 ? "verified" : failed * 2 > Math.max(1, mathSteps.length) ? "unverified" : "partially_verified";
  return { ...plan, steps, failedChecks, status };
}
