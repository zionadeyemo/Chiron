import "server-only";
import { z } from "zod";
import { db } from "../db";
import { logEvent, type EventContext } from "../events";
import { getLLM } from "../llm";
import type { UserProfile } from "../types";
import { append, chironMessage, ensureProfile, getCourse, getView, loadProblemState, type WorkspaceView } from "../workspace";
import { checkWork } from "./checkwork";
import { CheckAnswerOut } from "./llm-schemas";
import { recordEvidence } from "./memory";
import { learnerContext, planSolution, replanFromStudent, spliceSteps, splitStep } from "./planner";
import { emptyBoard } from "./project";
import { CHECK_ANSWER_SYSTEM } from "./prompts";
import { activate, BoardError, dismissCheck, fillScaffold, gotIt, hint, nextStep, resumeGuidance } from "./reveal";
import type { Course, Problem, SolutionPlan, WhiteboardState } from "./types";

// The board service: every whiteboard action, planning, and Check my work.

export const BoardAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activate"), stepIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("hint") }),
  z.object({ type: z.literal("got_it") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("fill"), stepIndex: z.number().int().min(1) }),
  z.object({ type: z.literal("too_big"), stepIndex: z.number().int().min(1) }),
  z.object({ type: z.literal("too_small"), stepIndex: z.number().int().min(1) }),
  z.object({ type: z.literal("dismiss_check") }),
  z.object({ type: z.literal("answer_check"), answer: z.string().min(1).max(1000) }),
]);
export type BoardAction = z.infer<typeof BoardAction>;

const PLAN_STALE_MS = 5 * 60 * 1000;
const PLAN_WAIT_MS = 280 * 1000;
const STEP_SIZE_LIMIT = 2;

interface State {
  course: Course;
  problem: Problem;
  plan: SolutionPlan | null;
  board: WhiteboardState;
  ctx: EventContext;
}

async function loadState(problemId: string, sessionId: string): Promise<State> {
  const { problem, plan, board } = await loadProblemState(problemId);
  const course = await getCourse(problem.courseId);
  return { course, problem, plan, board, ctx: { sessionId, courseId: problem.courseId, problemId } };
}

const saveBoard = (b: WhiteboardState) => db().put("boards", b.problemId, b);

async function adjustStepSize(delta: number) {
  await db().update<UserProfile>("profiles", (await ensureProfile()).id, (p) => {
    p.stepSize = Math.max(-STEP_SIZE_LIMIT, Math.min(STEP_SIZE_LIMIT, (p.stepSize ?? 0) + delta));
  });
}

// ── Actions shared by buttons, keyboard and chat ─────────────────────────────

export interface ActResult {
  board: WhiteboardState;
  /** One short chat line, when the action calls for it. */
  say?: string;
  hintLevel?: 1 | 2 | null;
}

export async function revealNext(s: State): Promise<ActResult> {
  const r = nextStep(s.plan, s.board);
  await logEvent(s.ctx, "next_step", { stepIndex: r.revealedIndex });
  if (r.checkShown) await logEvent(s.ctx, "check_question_shown", { stepIndex: r.revealedIndex });
  if (r.completed) await logEvent(s.ctx, "problem_completed", { by: "full_reveal", steps: s.plan!.steps.length });
  const step = s.plan!.steps[r.revealedIndex];
  await recordEvidence(s.course, step.concepts, "revealed");
  // Never present unverified math as certain.
  const say = step.verifyStatus === "failed" ? `I couldn't verify step ${r.revealedIndex} automatically — check it against your own work before relying on it.` : undefined;
  return { board: r.board, say };
}

export async function showHint(s: State): Promise<ActResult> {
  const r = hint(s.plan, s.board);
  if (r.level) {
    await logEvent(s.ctx, "hint_shown", { level: r.level, stepIndex: r.stepIndex, beforeFirstStep: s.board.revealedCount <= 1 });
    await recordEvidence(s.course, s.plan!.steps[r.stepIndex].concepts, "hint");
  }
  return { board: r.board, hintLevel: r.level };
}

export async function applyAction(problemId: string, sessionId: string, action: BoardAction): Promise<WorkspaceView> {
  const s = await loadState(problemId, sessionId);
  let result: ActResult = { board: s.board };

  switch (action.type) {
    case "activate":
      result.board = activate(s.board, action.stepIndex);
      break;
    case "next":
      result = await revealNext(s);
      break;
    case "hint":
      result = await showHint(s);
      break;
    case "got_it":
      result.board = gotIt(s.board);
      await logEvent(s.ctx, "i_got_it", { stepsRevealed: s.board.revealedCount - 1, planSteps: (s.plan?.steps.length ?? 1) - 1 });
      await recordEvidence(s.course, (s.plan?.steps ?? []).slice(1, s.board.revealedCount).flatMap((x) => x.concepts), "got_it");
      break;
    case "resume":
      result.board = resumeGuidance(s.board);
      await logEvent(s.ctx, "resume_guidance", { stepsRevealed: s.board.revealedCount - 1 });
      break;
    case "fill":
      result.board = fillScaffold(s.plan, s.board, action.stepIndex);
      break;
    case "dismiss_check":
      if (s.board.activeCheck) await logEvent(s.ctx, "check_question_dismissed", { stepIndex: s.board.activeCheck.stepIndex });
      result.board = dismissCheck(s.board);
      break;
    case "answer_check":
      result.board = await answerCheck(s, action.answer);
      break;
    case "too_big":
      ({ board: result.board } = await tooBig(s, action.stepIndex));
      break;
    case "too_small":
      if (!s.plan || action.stepIndex >= s.board.revealedCount) throw new BoardError("That step isn't on the board.");
      await adjustStepSize(-1);
      await logEvent(s.ctx, "step_size_feedback", { kind: "too_small", stepIndex: action.stepIndex });
      break;
  }

  await saveBoard(result.board);
  if (result.say) await append(s.course.id, problemId, chironMessage(result.say));
  return getView(s.course.id, sessionId);
}

/** "next" / "hint" typed in chat: same as the buttons, plus one short line for the chat. */
export async function actFromChat(problemId: string, sessionId: string, kind: "next" | "hint"): Promise<string> {
  const s = await loadState(problemId, sessionId);
  try {
    if (kind === "next") {
      const r = await revealNext(s);
      await saveBoard(r.board);
      return r.say ?? `Step ${r.board.revealedCount - 1} is on the board.`;
    }
    const r = await showHint(s);
    await saveBoard(r.board);
    if (r.hintLevel == null) return "Both hints are out. Press Next step when you want the step itself.";
    return `Hint ${r.hintLevel} is on the board, where step ${s.board.revealedCount} will go.`;
  } catch (err) {
    if (err instanceof BoardError) return err.message;
    throw err;
  }
}

async function answerCheck(s: State, answer: string): Promise<WhiteboardState> {
  const active = s.board.activeCheck;
  if (!active || !s.plan) throw new BoardError("There's no question to answer.");
  const step = s.plan.steps[active.stepIndex];
  const out = await getLLM().structured({
    tier: "fast",
    effort: "low",
    label: "check_answer",
    system: CHECK_ANSWER_SYSTEM,
    schema: CheckAnswerOut,
    parts: [{ type: "text", text: `<step title="${step.title}">${step.latex}</step>\n<why>${step.rationale}</why>\n<question>${step.checkQuestion}</question>\n<student_answer>${answer}</student_answer>` }],
  });
  await logEvent(s.ctx, "check_question_answered", { stepIndex: active.stepIndex, verdict: out.verdict });
  await recordEvidence(s.course, step.concepts, out.verdict === "right" ? "check_right" : "check_wrong");
  return { ...s.board, activeCheck: { ...active, answer, feedback: out.feedback } };
}

/** Too big: split the step into verified substeps on the board. */
async function tooBig(s: State, stepIndex: number): Promise<{ board: WhiteboardState }> {
  if (!s.plan || stepIndex >= s.board.revealedCount) throw new BoardError("That step isn't on the board.");
  const learner = learnerContext(s.course, await ensureProfile());
  const subs = await splitStep(s.problem, s.course, learner, s.plan, stepIndex);
  const plan = spliceSteps(s.plan, stepIndex, subs);
  const shift = subs.length - 1;
  const move = (i: number) => (i > stepIndex ? i + shift : i);
  const b = s.board;
  const board: WhiteboardState = {
    ...b,
    planVersion: plan.version,
    // Splitting the newest step shows its first substep; splitting an earlier one shows them all.
    revealedCount: stepIndex === b.revealedCount - 1 ? stepIndex + 1 : b.revealedCount + shift,
    activeStepIndex: stepIndex,
    hintLevelForNextStep: 0,
    filledScaffolds: b.filledScaffolds.filter((i) => i !== stepIndex).map(move),
    activeCheck: b.activeCheck && b.activeCheck.stepIndex !== stepIndex ? { ...b.activeCheck, stepIndex: move(b.activeCheck.stepIndex) } : null,
    lastCheckStep: move(b.lastCheckStep),
    studentLines: b.studentLines.map((l) => ({ ...l, afterStepIndex: move(l.afterStepIndex), matchedStepIndex: l.matchedStepIndex == null ? undefined : move(l.matchedStepIndex) })),
    updatedAt: new Date().toISOString(),
  };
  await db().put("plans", s.problem.id, plan);
  await adjustStepSize(+1);
  await logEvent(s.ctx, "step_size_feedback", { kind: "too_big", stepIndex });
  await logEvent(s.ctx, "replan", { reason: "too_big", stepIndex, substeps: subs.length, verified: subs.every((x) => x.verifyStatus !== "failed") });
  return { board };
}

// ── Planning ─────────────────────────────────────────────────────────────────

/**
 * Make sure the active problem has a plan. Idempotent: one request plans, others wait for it.
 * Called by the client right after the setup is shown (and to retry a failed plan).
 */
export async function ensurePlan(problemId: string, sessionId: string): Promise<WorkspaceView> {
  let claimed = false;
  const problem = await db().update<Problem>("problems", problemId, (p) => {
    const stale = !p.planStartedAt || Date.now() - Date.parse(p.planStartedAt) > PLAN_STALE_MS;
    if ((p.status === "planning" && stale) || p.status === "failed") {
      p.status = "planning";
      p.planStartedAt = new Date().toISOString();
      p.planError = undefined;
      claimed = true;
    }
  });

  if (!claimed) {
    // Someone else is planning (another tab, or a double click): wait for them.
    const until = Date.now() + PLAN_WAIT_MS;
    while (Date.now() < until) {
      const p = await db().get<Problem>("problems", problemId);
      if (!p || p.status !== "planning") break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return getView(problem.courseId, sessionId);
  }

  const s = await loadState(problemId, sessionId);
  const started = Date.now();
  try {
    const learner = learnerContext(s.course, await ensureProfile());
    const plan = await planSolution(s.problem, s.course, learner, s.board.planVersion + 1);
    await db().put("plans", problemId, plan);
    await db().update<WhiteboardState>("boards", problemId, (b) => {
      b.planVersion = plan.version;
    });
    await db().update<Problem>("problems", problemId, (p) => {
      p.status = "ready";
      p.updatedAt = new Date().toISOString();
    });
    await logEvent(s.ctx, "plan_ready", {
      latencyMs: Date.now() - started,
      steps: plan.steps.length - 1,
      status: plan.status,
      failedChecks: plan.failedChecks.length,
      repairRounds: plan.repairRounds,
      personalized: s.course.personalize,
    });
  } catch (err) {
    const message = err instanceof Error && "code" in err ? err.message : "Chiron couldn't work out a reliable solution for this one.";
    await db().update<Problem>("problems", problemId, (p) => {
      p.status = "failed";
      p.planError = `${message} You can try again, or edit the problem statement.`;
    });
    await logEvent(s.ctx, "plan_failed", { latencyMs: Date.now() - started, message });
    if (!(err instanceof Error && "code" in err)) console.error(err);
  }
  return getView(s.course.id, sessionId);
}

/** The statement changed: discard the plan and board, plan again. */
export async function resetForReplan(problemId: string, ctx: EventContext) {
  const board = (await db().get<WhiteboardState>("boards", problemId)) ?? emptyBoard(problemId);
  await db().remove("plans", problemId);
  await db().put("boards", problemId, { ...emptyBoard(problemId), planVersion: board.planVersion });
  await db().update<Problem>("problems", problemId, (p) => {
    p.status = "planning";
    p.planStartedAt = undefined;
    p.planError = undefined;
  });
  await logEvent(ctx, "replan", { reason: "edit" });
}

// ── Check my work ────────────────────────────────────────────────────────────

/** Runs Check my work and posts Chiron's reply. The student's message is already in the thread. */
export async function runCheckWork(problemId: string, sessionId: string, text: string, imageRefs: string[]): Promise<void> {
  const s = await loadState(problemId, sessionId);
  if (!s.plan) throw new BoardError("Still working through the problem — try checking your work in a moment.");
  const outcome = await checkWork({ problem: s.problem, plan: s.plan, board: s.board, text, imageRefs });
  let board = outcome.board;
  let message = outcome.message;

  await logEvent(s.ctx, "check_work", { verdict: outcome.line.verdict, matchedStep: outcome.line.matchedStepIndex ?? null, stepsRevealed: s.board.revealedCount - 1, photo: imageRefs.length > 0 });
  const matched = outcome.line.matchedStepIndex;
  const concepts = matched != null ? s.plan.steps[matched].concepts : [];
  if (outcome.line.verdict === "correct") await recordEvidence(s.course, concepts, "work_correct");
  if (outcome.line.verdict === "incorrect") await recordEvidence(s.course, s.plan.steps[Math.min(s.board.revealedCount, s.plan.steps.length - 1)].concepts, "work_incorrect");
  if (outcome.completed) await logEvent(s.ctx, "problem_completed", { by: "student", steps: s.plan.steps.length });

  if (outcome.replanFrom) {
    // A valid alternative method: re-plan from the student's lines and continue from there.
    try {
      const learner = learnerContext(s.course, await ensureProfile());
      const plan = await replanFromStudent(s.problem, s.course, learner, outcome.replanFrom, s.plan.version + 1);
      const studentSteps = plan.steps.filter((x) => x.origin === "student").length;
      await db().put("plans", problemId, plan);
      board = {
        ...board,
        planVersion: plan.version,
        revealedCount: Math.min(plan.steps.length, 1 + Math.max(1, studentSteps)),
        activeStepIndex: Math.min(plan.steps.length - 1, Math.max(1, studentSteps)),
        hintLevelForNextStep: 0,
        filledScaffolds: [],
        activeCheck: null,
        // Their lines now live on the board as their own steps.
        studentLines: board.studentLines.map((l) => (l.verdict === "different_method" || l.verdict === "correct" ? { ...l, absorbed: true } : l)),
      };
      await logEvent(s.ctx, "replan", { reason: "alternative_method", studentSteps, status: plan.status });
    } catch {
      message = `${outcome.message.replace(" I'll continue from your method.", "")} I couldn't rebuild the solution around your method just now — keep going, and check your next line.`;
    }
  }
  await saveBoard(board);
  await append(s.course.id, problemId, chironMessage(message));
}

export { BoardError };
