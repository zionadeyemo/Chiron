import "server-only";
import { newId } from "../db";
import { imageParts } from "../documents";
import { getLLM, type Part } from "../llm";
import { squashForLeak } from "./answers";
import { JudgeOut, ReadWorkOut } from "./llm-schemas";
import { JUDGE_SYSTEM, READ_WORK_SYSTEM } from "./prompts";
import { positionAt } from "./reveal";
import type { Problem, SolutionPlan, StudentLine, Verdict, WhiteboardState } from "./types";
import { checkEquivalence, equationResidual, equationsMatch, holdsUnder, lineSymbols, matchValue, symbolsOf } from "./verify";

// Check my work (brief 2.8). Code decides whether a line is right; the model only reads the
// line, describes errors, and tells same-method from a different method. A line is never
// marked correct unless the verifier agrees.

export interface CheckOutcome {
  board: WhiteboardState;
  line: StudentLine;
  /** Chiron's chat reply. */
  message: string;
  /** Set when the student used a valid alternative method: re-plan from their lines. */
  replanFrom: string[] | null;
  completed: boolean;
}

type Case = { kind: "correct"; step: number } | { kind: "consistent_not_in_plan" } | { kind: "incorrect" } | { kind: "not_checkable" } | { kind: "unclear"; why: string };

function revealedContext(plan: SolutionPlan, board: WhiteboardState): string {
  return plan.steps
    .slice(1, board.revealedCount)
    .map((s) => `${s.index}. ${s.title}: ${s.latex}`)
    .join("\n");
}

/** Which planned step does a verified-consistent line correspond to? */
function matchStep(line: string, plan: SolutionPlan): number | null {
  const unknowns = Object.keys(plan.solution);
  const r = equationResidual(line);
  if (r.isEquation) {
    for (const s of plan.steps) if (s.resultEquation && equationsMatch(line, s.resultEquation, unknowns)) return s.index;
    // "R_B = …" with the right value: the step that establishes R_B.
    const lhs = line.split("=")[0].trim();
    if (unknowns.includes(lhs)) {
      const defining = plan.steps.find((s) => s.resultEquation?.split("=")[0].trim() === lhs);
      if (defining) return defining.index;
    }
    return null;
  }
  // A bare expression: the value of some unknown, or some step's result.
  const symbol = matchValue(line, plan.solution);
  if (symbol) {
    const defining = plan.steps.find((s) => s.resultEquation?.split("=")[0].trim() === symbol);
    return defining?.index ?? plan.steps.length - 1;
  }
  for (const s of plan.steps) {
    const rhs = s.resultEquation?.split("=")[1];
    if (rhs && checkEquivalence({ lhs: line, rhs, variables: [] }).ok) return s.index;
  }
  return null;
}

function classify(line: string | undefined, plan: SolutionPlan): Case {
  if (!line) return { kind: "not_checkable" };
  const used = lineSymbols(line);
  if (!used) return { kind: "unclear", why: "the line couldn't be parsed" };
  const exprs = [...Object.values(plan.solution), ...plan.steps.flatMap((s) => (s.resultEquation ? [s.resultEquation] : []))];
  const known = new Set([...Object.keys(plan.solution), ...symbolsOf(exprs)]);
  const strange = used.filter((s) => !known.has(s));
  if (strange.length) return { kind: "unclear", why: `it uses ${strange.join(", ")}, which isn't a symbol in this problem` };

  const { isEquation } = equationResidual(line);
  if (isEquation) {
    if (!holdsUnder(line, plan.solution).ok) return { kind: "incorrect" };
    const step = matchStep(line, plan);
    return step != null ? { kind: "correct", step } : { kind: "consistent_not_in_plan" };
  }
  const step = matchStep(line, plan);
  if (step != null) return { kind: "correct", step };
  return { kind: "unclear", why: "it's an expression without saying what it equals" };
}

export async function checkWork(args: {
  problem: Problem;
  plan: SolutionPlan;
  board: WhiteboardState;
  text: string;
  imageRefs: string[];
}): Promise<CheckOutcome> {
  const { problem, plan, board, text, imageRefs } = args;
  const llm = getLLM();
  const symbols = [...new Set([...Object.keys(plan.solution), ...symbolsOf([...Object.values(plan.solution), ...plan.steps.flatMap((s) => (s.resultEquation ? [s.resultEquation] : []))])])];

  const parts: Part[] = [
    { type: "text", text: `<problem>\n${problem.statement}\n</problem>\n<symbols>${symbols.join(", ")}</symbols>\n<board_so_far>\n${revealedContext(plan, board) || "(setup only)"}\n</board_so_far>` },
    ...(await imageParts(imageRefs)),
    { type: "text", text: `<work>\n${text || "(see the image)"}\n</work>` },
  ];
  const read = await llm.structured({ tier: "fast", label: "read_work", system: READ_WORK_SYSTEM, schema: ReadWorkOut, parts });
  const mathLines = read.lines.filter((l) => l.mathjs?.trim());
  const current = mathLines.at(-1)?.mathjs?.trim();
  const c: Case = read.unreadable ? { kind: "unclear", why: "I couldn't read it" } : classify(current, plan);

  let verdict: Verdict;
  let feedback: string;
  let matched: number | undefined;
  let replanFrom: string[] | null = null;

  const judge = async (kind: string, extra = "") => {
    const reference = plan.steps
      .slice(1)
      .map((s) => `${s.index}. ${s.title}: ${s.latex}${s.resultEquation ? `  [result: ${s.resultEquation}]` : ""}`)
      .join("\n");
    return llm.structured({
      tier: "fast",
      label: "judge_work",
      system: JUDGE_SYSTEM,
      schema: JudgeOut,
      parts: [
        { type: "text", text: `<problem>\n${problem.statement}\n</problem>\n<private_plan>\n${reference}\n</private_plan>\n<revealed_through_step>${board.revealedCount - 1}</revealed_through_step>` },
        { type: "text", text: `<student_line>${read.readAs}</student_line>\n<checked_form>${current ?? "(none)"}</checked_form>\n<case>${kind}</case>${extra}` },
      ],
    });
  };

  switch (c.kind) {
    case "correct": {
      verdict = "correct";
      matched = c.step;
      const step = plan.steps[c.step];
      feedback = c.step >= board.revealedCount ? `Correct. That's step ${c.step} (${step.title}) — you're ahead of the board.` : c.step === board.revealedCount - 1 ? "Correct." : `Correct — that matches step ${c.step}.`;
      if (c.step === plan.steps.length - 1) feedback = "Correct — that's the final answer.";
      break;
    }
    case "consistent_not_in_plan": {
      const j = await judge("consistent_not_in_plan");
      if (j.approach === "different_method") {
        verdict = "different_method";
        feedback = `${j.feedback.trim()} I'll continue from your method.`;
        replanFrom = [];
      } else {
        verdict = "correct";
        matched = Math.max(1, Math.min(plan.steps.length - 1, j.nearestStep ?? board.revealedCount));
        feedback = j.feedback.trim() || "Correct.";
        if (!/^correct/i.test(feedback)) feedback = `Correct. ${feedback}`;
      }
      break;
    }
    case "incorrect": {
      const j = await judge("incorrect");
      verdict = "incorrect";
      feedback = guardLeak(j.feedback.trim(), plan, j.nearestStep) + " Want a hint?";
      break;
    }
    case "not_checkable": {
      const j = await judge("not_checkable");
      // Without the verifier, never "correct".
      verdict = "unclear";
      feedback = j.feedback.trim();
      if (!/can't verify|cannot verify/i.test(feedback) && !/^no\b|not right|isn't right/i.test(feedback)) feedback = `I can't verify this one with certainty. ${feedback}`;
      break;
    }
    case "unclear": {
      const j = await judge("unclear", `\n<why_unclear>${c.why}</why_unclear>`);
      verdict = "unclear";
      feedback = j.feedback.trim();
      break;
    }
  }

  const line: StudentLine = {
    id: newId("l_"),
    latexOrText: text || read.readAs,
    imageRef: imageRefs[0],
    readAs: imageRefs.length || text.trim() !== read.readAs.trim() ? read.readAs : undefined,
    verdict,
    feedback,
    matchedStepIndex: matched,
    afterStepIndex: Math.max(0, Math.min(matched ?? board.revealedCount - 1, Math.max(board.revealedCount - 1, matched ?? 0))),
    createdAt: new Date().toISOString(),
  };

  let next: WhiteboardState = { ...board, studentLines: [...board.studentLines, line] };
  if (verdict === "correct" && matched != null) next = positionAt(plan, next, matched);
  if (replanFrom) {
    replanFrom = [...board.studentLines.filter((l) => l.verdict === "correct" || l.verdict === "different_method").map((l) => l.readAs ?? l.latexOrText), read.readAs];
  }
  const completed = !board.completed && next.completed === "student";
  return { board: next, line, message: feedback, replanFrom, completed };
}

/** The judge sees the private plan; make sure its feedback doesn't hand over the corrected result. */
function guardLeak(feedback: string, plan: SolutionPlan, nearest?: number): string {
  const step = nearest != null ? plan.steps[nearest] : undefined;
  const rhs = step?.resultEquation?.split("=")[1];
  if (rhs && squashForLeak(rhs).length >= 3 && squashForLeak(feedback).includes(squashForLeak(rhs))) {
    return "That line doesn't hold for this problem. Check each term and its sign against the setup.";
  }
  return feedback;
}
