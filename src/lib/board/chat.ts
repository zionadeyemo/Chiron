import "server-only";
import { countWords, WORD_BUDGET } from "../depth";
import { imageParts, pageParts } from "../documents";
import { getLLM, type Part } from "../llm";
import type { UserProfile } from "../types";
import { ChatOut } from "./llm-schemas";
import { asksAboutHistory, findMemoryPhrase } from "./memory-phrases";
import { BASELINE_CHAT_SYSTEM, CHAT_SYSTEM } from "./prompts";
import type { ChatMessage, Course, Problem, SolutionPlan, WhiteboardState } from "./types";

// One chat turn. The packet holds only what the student can already see on the board —
// the chat model never receives unrevealed steps, so it can't leak them.

export interface ChatContext {
  course: Course;
  profile: UserProfile;
  problem: Problem | null;
  plan: SolutionPlan | null;
  board: WhiteboardState | null;
  history: ChatMessage[];
  message: ChatMessage;
  explainMoreOf?: ChatMessage;
  /** The student said a suspected new problem is a question: don't classify it as new_problem. */
  notNewProblem?: boolean;
}

const STYLE_LEVEL = { hints: 1, steps: 2, full: 3 } as const;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function revealedSteps(ctx: ChatContext) {
  if (!ctx.problem || !ctx.board) return [];
  const steps = ctx.plan?.steps ?? [];
  return steps.slice(0, ctx.board.revealedCount);
}

function learnerBlock(ctx: ChatContext): string | null {
  if (!ctx.course.personalize) return null;
  const p = ctx.profile;
  const tags = new Set(revealedSteps(ctx).flatMap((s) => s.concepts.map((c) => c.toLowerCase())));
  const relevant = Object.entries(p.knowledge).filter(([name]) => tags.has(name));
  const lines = [
    `<learner>`,
    [p.year, p.major].filter(Boolean).join(" ") || null,
    p.previousCourses.length ? `Previous courses: ${p.previousCourses.join(", ")}.` : null,
    `Prefers: ${p.depth.style === "hints" ? "short hints" : p.depth.style === "full" ? "full explanations" : "step-by-step help"}.`,
    relevant.length ? `Relevant concepts: ${relevant.map(([n, e]) => `${n} (${e.state})`).join("; ")}.` : null,
    `</learner>`,
  ];
  return lines.filter(Boolean).join("\n");
}

function whiteboardBlock(ctx: ChatContext): string {
  const { problem, board } = ctx;
  if (!problem || !board) return "<no_problem/>";
  const steps = revealedSteps(ctx);
  const rows: string[] = [];
  if (!steps.length && problem.setup) {
    rows.push(`<step index="0" title="Setup">Given: ${problem.setup.given.join("; ")}\nFind: ${problem.setup.find.join("; ")}</step>`);
  }
  for (const s of steps) {
    if (s.kind === "setup" && s.setup) {
      rows.push(`<step index="0" title="Setup">Given: ${s.setup.given.join("; ")}\nFind: ${s.setup.find.join("; ")}${s.setup.assumptions.length ? `\nAssumptions: ${s.setup.assumptions.join("; ")}` : ""}<rationale>${s.rationale}</rationale></step>`);
      continue;
    }
    const shown = s.kind === "scaffold" && !board.filledScaffolds.includes(s.index) ? (s.scaffoldLatex ?? s.latex) : s.latex;
    rows.push(`<step index="${s.index}" title="${s.title}"${s.verifyStatus === "failed" ? ' verified="no"' : ""}><latex>${shown}</latex><rationale>${s.rationale}</rationale></step>`);
  }
  const lines = board.studentLines.slice(-3).map((l) => `- "${clip(l.readAs ?? l.latexOrText, 300)}" → ${l.verdict ?? "unchecked"}${l.feedback ? ` (${clip(l.feedback, 200)})` : ""}`);
  return [
    `<problem title="${problem.title}">\n${problem.statement}\n</problem>`,
    `<whiteboard mode="${board.studentMode}" revealed="${steps.length || 1}">`,
    ...rows,
    `</whiteboard>`,
    `<active_step index="${Math.min(board.activeStepIndex, Math.max(0, steps.length - 1))}"/>`,
    lines.length ? `<student_lines>\n${lines.join("\n")}\n</student_lines>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function recentChat(history: ChatMessage[]): string {
  const recent = history.filter((m) => m.text.trim()).slice(-6);
  if (!recent.length) return "(none)";
  return recent.map((m) => `${m.role === "student" ? "Student" : "Chiron"}: ${clip(m.text, 400)}`).join("\n");
}

export interface ChatResult {
  out: ChatOut;
  verified: boolean;
  targetLevel: number;
}

export async function chatTurn(ctx: ChatContext): Promise<ChatResult> {
  const llm = getLLM();
  const base = ctx.course.personalize ? STYLE_LEVEL[ctx.profile.depth.style] : 2;
  const targetLevel = Math.min(4, ctx.explainMoreOf ? (ctx.explainMoreOf.depth ?? base) + 1 : base);
  const maxWords = WORD_BUDGET[targetLevel];

  const parts: Part[] = [];
  const learner = learnerBlock(ctx);
  if (learner) parts.push({ type: "text", text: learner });
  parts.push({ type: "text", text: `<course>${ctx.course.name}</course>` });
  if (ctx.problem?.source === "pdf" && ctx.problem.pdfRef) parts.push(...(await pageParts(ctx.problem.pdfRef.docId, ctx.problem.pdfRef.page)));
  if (ctx.problem?.imageRef) parts.push(...(await imageParts([ctx.problem.imageRef])));
  parts.push({
    type: "text",
    text: [
      whiteboardBlock(ctx),
      `<recent_chat>\n${recentChat(ctx.history)}\n</recent_chat>`,
      `<depth_target level="${targetLevel}" max_words="${maxWords}"/>`,
      ctx.notNewProblem ? `<note>The student confirmed this is a question, not a new problem. Answer it.</note>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (ctx.message.imageRefs?.length) parts.push(...(await imageParts(ctx.message.imageRefs)));
  parts.push({
    type: "text",
    text: ctx.explainMoreOf
      ? `<explain_more>The student pressed "Explain more" on your answer:\n"${ctx.explainMoreOf.text}"\nGo exactly one level deeper (level ${targetLevel}), aimed at the same point. Build on it; don't repeat it.</explain_more>`
      : `<student_message>${ctx.message.text || "(image only)"}</student_message>`,
  });

  const history = ctx.message.text;
  const { payload, mathCalls } = await llm.toolTurn({
    tier: "fast",
    label: "chat",
    system: CHAT_SYSTEM,
    parts,
    respond: {
      schema: ChatOut,
      description: "Your classification of the student's message and your reply. Call exactly once, last.",
      review: (out, calls) => {
        if (out.containsCalculation && !calls.some((c) => c.ok)) {
          return "Your reply states a calculation that no math tool has checked this turn. Check it with a math tool, then call respond again (or remove it).";
        }
        if (!ctx.explainMoreOf && countWords(out.reply) > maxWords * 2) {
          return `Too long: the budget is ${maxWords} words. Keep only what the student needs to continue, then call respond again.`;
        }
        const phrase = findMemoryPhrase(out.reply);
        if (phrase && !asksAboutHistory(history)) {
          return `Don't mention what you know about the student ("${phrase}"). Rewrite the reply without referring to their history, then call respond again.`;
        }
        return null;
      },
    },
  });
  const out = ctx.notNewProblem && payload.intent === "new_problem" ? { ...payload, intent: "general_question" as const } : payload;
  return { out, verified: mathCalls.some((c) => c.ok), targetLevel };
}

/** Baseline arm: a plain tutor with normal chat history and no whiteboard behaviours. */
export async function baselineTurn(ctx: ChatContext): Promise<string> {
  const history = ctx.history
    .filter((m) => m.text.trim())
    .slice(-20)
    .map((m) => ({ role: m.role === "student" ? ("user" as const) : ("assistant" as const), text: m.text }));
  const parts: Part[] = [];
  if (ctx.problem) parts.push({ type: "text", text: `I'm working on this problem:\n${ctx.problem.statement}\n\n` });
  if (ctx.message.imageRefs?.length) parts.push(...(await imageParts(ctx.message.imageRefs)));
  parts.push({ type: "text", text: ctx.explainMoreOf ? "Explain more." : ctx.message.text });
  return getLLM().text({ tier: "fast", label: "baseline", system: BASELINE_CHAT_SYSTEM, history, parts });
}
