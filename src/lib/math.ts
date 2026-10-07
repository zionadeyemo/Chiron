import "server-only";
import { all, create, type MathNode } from "mathjs";

// Server-side math the tutor must use before stating any numeric or algebraic step.
// Symbols are free variables; write flexural rigidity as the single symbol EI.

const math = create(all);

const fmt = (v: unknown) => math.format(v as never, { precision: 10 });
const str = (n: MathNode) => n.toString({ implicit: "show" });

function freeSymbols(node: MathNode): string[] {
  const names = new Set<string>();
  node.traverse((n, _path, parent) => {
    if (n.type === "SymbolNode") {
      const name = (n as unknown as { name: string }).name;
      const isFnName = parent?.type === "FunctionNode" && (parent as unknown as { fn: MathNode }).fn === n;
      if (!isFnName && name !== "pi") names.add(name);
    }
  });
  return [...names];
}

function randomScope(symbols: string[], seed: number) {
  // Deterministic pseudo-random points in [0.4, 2.6] so results are reproducible.
  let x = seed * 9301 + 49297;
  const rand = () => ((x = (x * 9301 + 49297) % 233280), x / 233280);
  return Object.fromEntries(symbols.map((s) => [s, 0.4 + 2.2 * rand()]));
}

function numericallyZero(node: MathNode, symbols: string[]): { zero: boolean; sample?: string } {
  const compiled = node.compile();
  for (let i = 1; i <= 8; i++) {
    const scope = randomScope(symbols, i);
    const v = Number(compiled.evaluate(scope));
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v) > 1e-9) {
      const at = Object.entries(scope)
        .map(([k, n]) => `${k}=${n.toFixed(3)}`)
        .join(", ");
      return { zero: false, sample: `difference = ${v.toPrecision(6)} at ${at}` };
    }
  }
  return { zero: true };
}

const simplify = (expr: string | MathNode) => math.simplify(expr as never);

// ── Tools ────────────────────────────────────────────────────────────────────

export function calculate(input: { expressions: string[]; scope?: Record<string, string | number> }) {
  const scope: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.scope ?? {})) {
    scope[k] = typeof v === "number" ? v : math.evaluate(v);
  }
  return input.expressions.map((expr) => {
    try {
      const result = math.evaluate(expr, { ...scope });
      return { expression: expr, result: fmt(result) };
    } catch {
      // Undefined symbols → treat as algebra and simplify.
      const node = simplify(expr);
      return { expression: expr, simplified: str(node), tex: node.toTex() };
    }
  });
}

export function checkEquivalent(input: { a: string; b: string }) {
  const diff = math.parse(`(${input.a}) - (${input.b})`);
  const symbols = freeSymbols(diff);
  const numeric = numericallyZero(diff, symbols);
  let simplifiedDifference: string | undefined;
  try {
    simplifiedDifference = str(simplify(diff));
  } catch {
    simplifiedDifference = undefined;
  }
  return {
    equivalent: numeric.zero,
    method: "numeric comparison at 8 sample points + symbolic simplification",
    simplifiedDifference,
    counterexample: numeric.sample,
  };
}

export function derivative(input: { expression: string; variable: string }) {
  const d = math.derivative(input.expression, input.variable);
  return { derivative: str(d), tex: d.toTex() };
}

function substitute(node: MathNode, values: Record<string, MathNode>): MathNode {
  return node.transform((n) => {
    if (n.type === "SymbolNode") {
      const name = (n as unknown as { name: string }).name;
      if (name in values) return new math.ParenthesisNode(values[name]);
    }
    return n;
  });
}

function det(m: string[][]): string {
  if (m.length === 1) return m[0][0];
  if (m.length === 2) return `((${m[0][0]})*(${m[1][1]}) - (${m[0][1]})*(${m[1][0]}))`;
  const terms = m[0].map((a, j) => {
    const minor = m.slice(1).map((row) => row.filter((_, k) => k !== j));
    return `${j % 2 ? "-" : "+"}(${a})*${det(minor)}`;
  });
  return `(${terms.join(" ")})`;
}

/** Symbolic linear solve by Cramer's rule, verified by back-substitution. */
export function solveLinearSystem(input: { equations: string[]; unknowns: string[] }) {
  const { equations, unknowns } = input;
  if (equations.length !== unknowns.length) throw new Error("need as many equations as unknowns");
  if (unknowns.length > 4) throw new Error("at most 4 unknowns");

  const exprs = equations.map((eq) => {
    const [lhs, rhs, extra] = eq.split("=");
    if (rhs === undefined || extra !== undefined) throw new Error(`"${eq}" must contain exactly one "="`);
    return math.parse(`(${lhs}) - (${rhs})`);
  });

  const zeros = Object.fromEntries(unknowns.map((u) => [u, new math.ConstantNode(0)]));
  const A: string[][] = [];
  const b: string[] = [];
  for (const e of exprs) {
    const row = unknowns.map((u) => {
      const coeff = simplify(math.derivative(e, u));
      if (freeSymbols(coeff).some((s) => unknowns.includes(s))) {
        throw new Error(`system is not linear in ${unknowns.join(", ")}`);
      }
      return str(coeff);
    });
    A.push(row);
    b.push(str(simplify(math.parse(`-(${str(substitute(e, zeros))})`))));
  }

  const D = det(A);
  const dNode = simplify(D);
  if (str(dNode) === "0") throw new Error("system is singular (determinant is 0)");

  const solution: Record<string, MathNode> = {};
  unknowns.forEach((u, j) => {
    const Aj = A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)));
    solution[u] = simplify(`(${det(Aj)}) / (${D})`);
  });

  const verified = exprs.every((e) => {
    const back = substitute(e, solution);
    return numericallyZero(back, freeSymbols(back)).zero;
  });

  return {
    solution: Object.fromEntries(Object.entries(solution).map(([k, v]) => [k, str(v)])),
    tex: Object.fromEntries(Object.entries(solution).map(([k, v]) => [k, v.toTex()])),
    verifiedBySubstitution: verified,
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export const MATH_TOOL_NAMES = ["calculate", "check_equivalent", "derivative", "solve_linear_system"] as const;
export type MathToolName = (typeof MATH_TOOL_NAMES)[number];

export function isMathTool(name: string): name is MathToolName {
  return (MATH_TOOL_NAMES as readonly string[]).includes(name);
}

export function runMathTool(name: MathToolName, input: unknown): { ok: boolean; output: string } {
  try {
    const i = input as never;
    const result =
      name === "calculate"
        ? calculate(i)
        : name === "check_equivalent"
          ? checkEquivalent(i)
          : name === "derivative"
            ? derivative(i)
            : solveLinearSystem(i);
    return { ok: true, output: JSON.stringify(result) };
  } catch (err) {
    return { ok: false, output: `error: ${(err as Error).message}` };
  }
}
