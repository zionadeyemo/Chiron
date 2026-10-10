// Math tools (JSON Schema), provider-neutral. Backed by src/lib/math.ts.

export interface ToolSpec {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export const MATH_TOOL_SPECS: ToolSpec[] = [
  {
    name: "calculate",
    description:
      "Evaluate numeric expressions (mathjs syntax, supports units like '12 kN/m * 5 m'), or simplify symbolic ones. Optional scope assigns values to symbols.",
    schema: {
      type: "object",
      properties: {
        expressions: { type: "array", items: { type: "string" } },
        scope: { type: "object", additionalProperties: { type: ["string", "number"] } },
      },
      required: ["expressions"],
    },
  },
  {
    name: "check_equivalent",
    description:
      "Check whether two expressions are algebraically equivalent (e.g. a student's answer vs. the correct one). Use before agreeing or disagreeing with any expression.",
    schema: {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a", "b"],
    },
  },
  {
    name: "derivative",
    description: "Symbolic derivative of an expression with respect to a variable.",
    schema: {
      type: "object",
      properties: { expression: { type: "string" }, variable: { type: "string" } },
      required: ["expression", "variable"],
    },
  },
  {
    name: "solve_linear_system",
    description:
      "Solve a linear system symbolically (up to 4 unknowns), e.g. equilibrium + compatibility equations. Each equation contains one '='. Returns the solution verified by back-substitution.",
    schema: {
      type: "object",
      properties: {
        equations: { type: "array", items: { type: "string" } },
        unknowns: { type: "array", items: { type: "string" } },
      },
      required: ["equations", "unknowns"],
    },
  },
];
