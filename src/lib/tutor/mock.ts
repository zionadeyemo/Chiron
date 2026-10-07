import "server-only";
import { countWords } from "../depth";
import { runMathTool } from "../math";
import type { MathCall } from "../types";
import type { PacketPart } from "./packet";
import type { RespondPayload } from "./schema";
import type { BaselineHistoryItem, ChironOptions, ChironResult, Tutor } from "./types";

// OFFLINE SCRIPTED TUTOR — for UI development without an API key (LLM_MOCK=1).
// It only knows the demo script. Every turn it produces is labelled "mock" in the UI.

interface Script {
  match: RegExp;
  /** Variants from shortest to longest; the longest that fits the budget is used. */
  variants: string[];
  extra?: Partial<RespondPayload>;
  math?: { tool: "check_equivalent" | "solve_linear_system"; input: unknown };
}

const SCRIPTS: Script[] = [
  {
    match: /why.*(zero|0)/i,
    variants: [
      "$B$ is a roller, so it can't move vertically: $v_B = 0$ (p. 341, Eq. 7.6).",
      "Because $B$ sits on a roller: it can't translate vertically, so the total deflection there has to vanish, $v_B = 0$ (p. 341, Eq. 7.6). That's the compatibility condition.",
    ],
    extra: { sources: [{ type: "material", ref: "p. 341, Eq. 7.6" }], detectedConcepts: ["compatibility conditions"] },
  },
  {
    match: /components of strain|strain components/i,
    variants: [
      "Three normal strains $\\varepsilon_{xx}, \\varepsilon_{yy}, \\varepsilon_{zz}$ and three shear strains $\\gamma_{xy}, \\gamma_{yz}, \\gamma_{zx}$.",
    ],
    extra: {
      sideQuestion: "open",
      sources: [{ type: "general", ref: "general knowledge — not in this chapter" }],
      detectedConcepts: ["3d strain components"],
      knowledgeUpdates: [{ concept: "3d strain components", state: "uncertain", evidence: "asked to be reminded" }],
    },
  },
  {
    match: /^(got it|ok|okay|makes sense|thanks)[.!]*$/i,
    variants: ["Right, so for 7.18: which two cases from Table 7.1 add up to $v_B$?"],
    extra: { sideQuestion: "close" },
  },
  {
    match: /next|what do i do|stuck/i,
    variants: [
      "Write $v_B$ as the uniform-load case (Eq. 7.7) plus the tip-load case with $R = R_B$ (Eq. 7.8), and set it to zero.",
      "Superpose: $v_B$ = the cantilever under $w$ (Eq. 7.7) plus the cantilever under upward $R_B$ (Eq. 7.8). Set the sum to zero (Eq. 7.6) — that's your compatibility equation for part (a).",
    ],
    extra: {
      sources: [{ type: "material", ref: "p. 341, Table 7.1" }],
      taskUpdate: { currentStep: "Writing v_B = 0 from Table 7.1 cases", task: null },
      detectedConcepts: ["method of superposition", "compatibility conditions"],
    },
  },
  {
    match: /w\s*\*?\s*l\s*\/\s*2/i,
    variants: [
      "Not right: $wL/2$ is the simply-supported answer, and the supports here differ (p. 342). Solve your compatibility equation for $R_B$ instead.",
      "That's not right. $wL/2$ assumes symmetry, as if both ends were simple supports — but $A$ is fixed, which attracts more load (p. 342). Your compatibility equation gives a different $R_B$; solve it rather than splitting the load.",
    ],
    extra: {
      studentClaim: { claim: "R = wL/2", verdict: "incorrect" },
      containsCalculation: true,
      sources: [{ type: "material", ref: "p. 342" }, { type: "inference", ref: "checked against compatibility" }],
      detectedConcepts: ["compatibility conditions", "static equilibrium"],
    },
    math: { tool: "check_equivalent", input: { a: "w*L/2", b: "3*w*L/8" } },
  },
];

const EXPLAIN_MORE = [
  "",
  "",
  "Removing the roller leaves a cantilever. Under $w$ alone its tip drops by $wL^4/8EI$ (Eq. 7.7); the upward $R_B$ alone lifts it by $R_BL^3/3EI$ (Eq. 7.8). The real roller allows no net movement, so the two must cancel.",
  "1. Release the redundant: without the roller the beam is a determinate cantilever.\n2. Load alone: the tip deflects $-wL^4/8EI$ (Eq. 7.7).\n3. Redundant alone: the tip deflects $+R_BL^3/3EI$ (Eq. 7.8).\n4. Compatibility: the roller forbids vertical motion, so the sum is zero (Eq. 7.6). That single equation is what statics couldn't give you.",
  "Equilibrium gives three equations for four unknowns, so the beam's stiffness has to decide how the load splits. Superposition makes that concrete: the released cantilever would sag at $B$, and $R_B$ is exactly the force that pushes it back to zero. The same logic works for any redundant — pick the support, find what it prevents, enforce that it's prevented. With more redundants you get one compatibility equation per redundant and solve them together, which is just a small linear system.",
];

function lastText(parts: PacketPart[]): string {
  const p = [...parts].reverse().find((x) => x.type === "text");
  return p && p.type === "text" ? p.text : "";
}

function pick(variants: string[], maxWords: number) {
  const fitting = variants.filter((v) => countWords(v) <= maxWords);
  return fitting.length ? fitting[fitting.length - 1] : variants[0];
}

export class MockTutor implements Tutor {
  async chiron(parts: PacketPart[], opts: ChironOptions): Promise<ChironResult> {
    await new Promise((r) => setTimeout(r, 350));
    const packet = lastText(parts);
    const base: RespondPayload = {
      response: "",
      explanationDepth: Math.min(opts.targetLevel, 2),
      sources: [],
      containsCalculation: false,
      calculationsVerified: false,
      studentClaim: null,
      detectedConcepts: [],
      knowledgeUpdates: [],
      taskUpdate: null,
      sideQuestion: "none",
    };
    const mathCalls: MathCall[] = [];

    if (packet.includes("<explain_more>")) {
      const response = EXPLAIN_MORE[opts.targetLevel] || EXPLAIN_MORE[3];
      return {
        payload: { ...base, response, explanationDepth: opts.targetLevel, sources: [{ type: "material", ref: "p. 341, Eqs. 7.5–7.8" }], detectedConcepts: ["method of superposition"] },
        mathCalls,
        retries: 0,
        mock: true,
      };
    }

    const question = packet.match(/<student_message>([\s\S]*)<\/student_message>/)?.[1]?.trim() ?? "";
    const script = SCRIPTS.find((s) => s.match.test(question));
    if (!script) {
      return {
        payload: { ...base, response: "(Mock tutor: I only know the demo script. Set LLM_API_KEY for real answers.)", explanationDepth: 1 },
        mathCalls,
        retries: 0,
        mock: true,
      };
    }
    if (script.math) {
      const { ok, output } = runMathTool(script.math.tool, script.math.input);
      mathCalls.push({ tool: script.math.tool, input: script.math.input, output, ok });
    }
    const response = pick(script.variants, opts.maxWords);
    const depth = script.variants.indexOf(response) === 0 ? 1 : 2;
    return {
      payload: { ...base, ...script.extra, response, explanationDepth: depth, calculationsVerified: mathCalls.some((c) => c.ok) },
      mathCalls,
      retries: 0,
      mock: true,
    };
  }

  async baseline(_history: BaselineHistoryItem[], parts: PacketPart[]): Promise<{ text: string; mock: boolean }> {
    await new Promise((r) => setTimeout(r, 350));
    const q = lastText(parts).split("\n").pop() ?? "";
    return {
      text: `(Mock baseline tutor.) Great question! Let's go through this step by step. ${q ? `You asked: "${q}". ` : ""}In a statically indeterminate beam, equilibrium alone isn't enough, so we bring in compatibility. First, recall that a propped cantilever has four reactions and three equilibrium equations…`,
      mock: true,
    };
  }
}
