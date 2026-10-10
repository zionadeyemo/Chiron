import "server-only";
import { findFixture, loadFixtures } from "../fixtures";
import { runMathTool } from "../math";
import type { MathCall } from "../types";
import { LLMError, type LLM, type Part, type StructuredRequest, type TextRequest, type ToolTurnRequest } from "./types";

// OFFLINE MOCK LLM (LLM_MOCK=1) — deterministic, fixture-driven, for UI work and end-to-end
// tests. It is not the product: everything it writes is marked "(mock)" where students see it.

type Handler = (text: string, parts: Part[]) => Promise<unknown> | unknown;

const allText = (parts: Part[]) =>
  parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
const tag = (text: string, name: string) => text.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "";

async function intake(text: string, parts: Part[]) {
  const statement = tag(text, "problem") || (parts.some((p) => p.type === "image") ? (await loadFixtures())[0]?.statement ?? "" : "");
  const fixture = await findFixture(statement);
  if (fixture) return { isProblem: true, title: fixture.title, statement: fixture.statement, ...fixture.setup };
  const looksLikeProblem = /\b(find|determine|compute|calculate|solve|evaluate|show that)\b/i.test(statement) && statement.length > 30;
  const sentences = statement.split(/(?<=[.?])\s+/).filter(Boolean);
  return {
    isProblem: looksLikeProblem,
    title: statement.slice(0, 60) || "Problem",
    statement: statement || "(mock) unreadable",
    given: sentences.filter((s) => !/\b(find|determine|compute|calculate|solve|evaluate)\b/i.test(s)).slice(0, 4),
    find: sentences.filter((s) => /\b(find|determine|compute|calculate|solve|evaluate)\b/i.test(s)).slice(0, 3).concat(looksLikeProblem ? [] : ["(mock) —"]),
    assumptions: [],
  };
}

function chatIntent(message: string): string {
  const m = message.toLowerCase();
  if (/^(next|next step|what'?s next|keep going)\b/.test(m)) return "ask_next_step";
  if (/\bhint\b/.test(m)) return "ask_hint";
  if (/^(i (got|get|think)|my (answer|line|work))\b/.test(m) || /=/.test(m)) return "student_work";
  if (m.length > 120 && /\b(find|determine|compute|calculate)\b/.test(m)) return "new_problem";
  if (/\b(why|how|where|what)\b/.test(m)) return message.includes("<no_problem/>") ? "general_question" : "question_about_step";
  return "other";
}

function chat(text: string) {
  const message = tag(text, "student_message");
  const explainMore = text.includes("<explain_more");
  const intent = explainMore ? "question_about_step" : chatIntent(message);
  const hasProblem = !text.includes("<no_problem/>");
  const active = Number(text.match(/<active_step index="(\d+)"/)?.[1] ?? 0);
  const stepRef = Number(message.match(/\bstep (\d+)/i)?.[1] ?? active);
  const step = text.match(new RegExp(`<step index="${stepRef}" title="([^"]*)">[\\s\\S]*?<rationale>([\\s\\S]*?)</rationale>`));
  let reply = "";
  if (intent === "question_about_step" || intent === "general_question" || intent === "other") {
    reply = !hasProblem
      ? "(mock) A short, direct answer to your general question."
      : step
        ? `(mock) Step ${stepRef}, ${step[1]}: ${step[2].trim()}${explainMore ? " (mock) One level deeper: this is the condition the support imposes." : ""}`
        : "(mock) Here's the short answer about the setup.";
  }
  return { intent, stepRef: hasProblem ? stepRef : undefined, reply, depth: explainMore ? 2 : 1, containsCalculation: false };
}

async function fixturePlan(text: string) {
  const fixture = await findFixture(tag(text, "problem"));
  if (fixture?.referencePlan) return structuredClone(fixture.referencePlan) as Record<string, unknown>;
  return {
    method: "(mock) no reference plan for this problem",
    steps: [
      {
        kind: "concept",
        title: "(mock) Think it through",
        latex: "\\text{(mock step)}",
        rationale: "(mock)",
        hint1: "(mock) first hint",
        hint2: "(mock) second hint",
        checks: [{ type: "none", reason: "mock" }],
        concepts: [],
      },
    ],
    finalAnswer: { latex: "\\text{(mock)}" },
    solution: [],
  };
}

async function replan(text: string) {
  const plan = (await fixturePlan(text)) as { steps: Record<string, unknown>[] };
  const student = tag(text, "student_lines").split("\n").filter(Boolean).at(-1)?.replace(/^\d+\.\s*/, "") ?? "";
  const mathjs = student.replace(/^[^:]*:\s*/, "").replace(/\s*\(.*\)\s*$/, "");
  plan.steps.unshift({
    kind: "equation",
    title: "Your equation",
    latex: mathjs.replace(/\*/g, " "),
    rationale: "(mock) The equation you wrote.",
    hint1: "(mock)",
    hint2: "(mock)",
    checks: [{ type: "numeric", expr: "1", expected: 1 }],
    concepts: [],
    fromStudent: true,
  });
  return plan;
}

function split(text: string) {
  const original = (JSON.parse(tag(text, "step_to_split")) as { steps: Record<string, unknown>[] }).steps[0];
  return {
    steps: [
      { ...original, title: `${original.title} — set up`, resultEquation: undefined, checkQuestion: undefined },
      { ...original, title: `${original.title} — finish` },
    ],
  };
}

/** Typed work → mathjs: just strip units and tidy symbols; tests type mathjs-friendly lines. */
function readWork(text: string) {
  const work = tag(text, "work");
  const lines = work
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const mathjs = l
        .replace(/^[^=]*?:\s*/, "")
        .replace(/\b(kN|N|m|kN·m)\b/g, "")
        .replace(/[×·]/g, "*")
        .trim();
      return { latex: l, mathjs: /=|\d/.test(mathjs) ? mathjs : undefined };
    });
  return { readAs: work, lines, unreadable: !work.trim() };
}

function judge(text: string) {
  const kind = tag(text, "case");
  const line = tag(text, "student_line").toLowerCase();
  const revealed = Number(tag(text, "revealed_through_step") || 0);
  if (kind === "incorrect") return { approach: "unclear", nearestStep: revealed + 1, feedback: "(mock) Check the sign of each term: one of your moments points the wrong way." };
  if (kind === "consistent_not_in_plan") {
    const different = /about (the load|b|point)/.test(line);
    return { approach: different ? "different_method" : "same_method", nearestStep: revealed + 1, feedback: different ? "(mock) That works — a different moment centre." : "(mock) Nice — you combined two steps." };
  }
  if (kind === "not_checkable") return { approach: "unclear", feedback: "I can't verify this one with certainty. (mock) It sounds reasonable." };
  return { approach: "unclear", feedback: "(mock) Which quantity is that?" };
}

const HANDLERS: Record<string, Handler> = {
  intake,
  chat,
  plan: fixturePlan,
  repair: () => ({ fixes: [] }),
  replan,
  split,
  read_work: readWork,
  judge_work: judge,
  check_answer: () => ({ verdict: "right", feedback: "Exactly. (mock)" }),
};

/** Registered by later modules (planner, judge…) so the mock grows with the app. */
export function registerMockHandler(label: string, handler: Handler) {
  HANDLERS[label] = handler;
}

export class MockLLM implements LLM {
  readonly provider = "mock" as const;
  readonly models = { strong: "mock", fast: "mock" };

  private async run(label: string, parts: Part[]) {
    const handler = HANDLERS[label];
    if (!handler) throw new LLMError(`The offline mock has no handler for "${label}".`, "api");
    await new Promise((r) => setTimeout(r, 120)); // feel like a network call, keep tests fast
    return handler(allText(parts), parts);
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const parsed = req.schema.safeParse(await this.run(req.label, req.parts));
    if (!parsed.success) throw new LLMError(`Mock output for "${req.label}" is invalid: ${parsed.error.message}`, "invalid_output");
    return parsed.data;
  }

  async toolTurn<T>(req: ToolTurnRequest<T>) {
    const out = (await this.run(req.label, req.parts)) as Record<string, unknown> & { __math?: { tool: string; input: unknown } };
    const mathCalls: MathCall[] = [];
    if (out.__math) {
      const { ok, output } = runMathTool(out.__math.tool as never, out.__math.input);
      mathCalls.push({ tool: out.__math.tool, input: out.__math.input, output, ok });
      delete out.__math;
    }
    const parsed = req.respond.schema.safeParse(out);
    if (!parsed.success) throw new LLMError(`Mock output for "${req.label}" is invalid: ${parsed.error.message}`, "invalid_output");
    return { payload: parsed.data, mathCalls };
  }

  async text(req: TextRequest): Promise<string> {
    await new Promise((r) => setTimeout(r, 120));
    return `(mock baseline) Great question! Let's go through it step by step. ${allText(req.parts).slice(-120)}`;
  }
}
