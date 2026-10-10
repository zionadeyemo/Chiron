import "server-only";
import { imageParts, pageParts } from "../documents";
import { conceptsByState } from "../learner";
import { getLLM, type Part } from "../llm";
import type { UserProfile } from "../types";
import { PlannerOut, RepairOut, SplitOut, type PlannerCheck, type PlannerStep, type StepFix } from "./llm-schemas";
import { setupStep } from "./project";
import { PLANNER_SYSTEM, REPAIR_INSTRUCTIONS, REPLAN_FROM_STUDENT, SPLIT_INSTRUCTIONS } from "./prompts";
import type { Course, Problem, SolutionPlan, SolutionStep, VerificationSpec } from "./types";
import { equationsMatch, verifyPlan, verifyStep } from "./verify";

// The Planner: solves the whole problem privately, then the Verifier checks every step with
// code; flagged steps go back for repair (max 2 rounds). Nothing here is sent to the client.

export const MAX_REPAIR_ROUNDS = 2;

export interface LearnerContext {
  /** null when the course has personalization off: the Planner sees only the course and problem. */
  block: string | null;
  stepSize: number;
}

export function learnerContext(course: Course, profile: UserProfile): LearnerContext {
  if (!course.personalize) return { block: null, stepSize: 0 };
  const k = conceptsByState(profile.knowledge);
  const lines = [
    "<learner>",
    [profile.year, profile.major].filter(Boolean).join(" ") || null,
    profile.previousCourses.length ? `Previous courses: ${profile.previousCourses.join(", ")}.` : null,
    k.known.length ? `Comfortable with: ${k.known.join("; ")}.` : null,
    k.learning.length ? `Still learning: ${k.learning.join("; ")}.` : null,
    k.uncertain.length ? `Uncertain about: ${k.uncertain.join("; ")}.` : null,
    "</learner>",
  ].filter(Boolean);
  return { block: lines.length > 2 ? lines.join("\n") : null, stepSize: profile.stepSize ?? 0 };
}

async function problemParts(problem: Problem, course: Course, learner: LearnerContext): Promise<Part[]> {
  const parts: Part[] = [{ type: "text", text: `<course>${course.name}</course>` }];
  if (learner.block) parts.push({ type: "text", text: learner.block });
  parts.push({ type: "text", text: `<step_size>${learner.stepSize}</step_size>` });
  if (problem.pdfRef) parts.push(...(await pageParts(problem.pdfRef.docId, problem.pdfRef.page)));
  if (problem.imageRef) parts.push(...(await imageParts([problem.imageRef])));
  const setup = problem.setup;
  parts.push({
    type: "text",
    text: [
      `<problem>\n${problem.statement}\n</problem>`,
      setup ? `<setup_on_board>\nGiven: ${setup.given.join("; ")}\nFind: ${setup.find.join("; ")}${setup.assumptions.length ? `\nAssumptions: ${setup.assumptions.join("; ")}` : ""}\n</setup_on_board>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return parts;
}

// ── LLM output → domain ──────────────────────────────────────────────────────

function toCheck(c: PlannerCheck): VerificationSpec {
  if (c.type === "numeric" && c.expr && typeof c.expected === "number") {
    return { type: "numeric", expr: c.expr, expected: c.expected, tolerance: c.tolerance, units: c.units };
  }
  if (c.type === "equivalence" && c.lhs && c.rhs) return { type: "equivalence", lhs: c.lhs, rhs: c.rhs, variables: c.variables ?? [] };
  if (c.type === "none") return { type: "none", reason: c.reason || "conceptual" };
  // A malformed check is a failed check, never a silent pass.
  return { type: "numeric", expr: `malformed_${c.type}_check`, expected: 0 };
}

function toStep(s: PlannerStep, index: number): SolutionStep {
  return {
    index,
    kind: s.kind,
    title: s.title.trim(),
    latex: s.latex.trim(),
    scaffoldLatex: s.kind === "scaffold" ? s.scaffoldLatex?.trim() || undefined : undefined,
    rationale: s.rationale.trim(),
    hints: [s.hint1.trim(), s.hint2.trim()],
    checkQuestion: s.checkQuestion?.trim() || undefined,
    verification: s.checks.map(toCheck),
    concepts: s.concepts.map((c) => c.trim().toLowerCase()).filter(Boolean),
    resultEquation: s.resultEquation?.trim() || undefined,
    origin: s.fromStudent ? "student" : "plan",
    verifyStatus: "unchecked",
  };
}

/** Planner output → a verified plan (exported for fixture tests and the offline mock). */
export function planFromOutput(problem: Problem, out: PlannerOut, version = 1): SolutionPlan {
  return toPlan(problem, out, version, Date.now(), 0);
}

function toPlan(problem: Problem, out: PlannerOut, version: number, started: number, repairRounds: number): SolutionPlan {
  return verifyPlan({
    problemId: problem.id,
    method: out.method,
    steps: [setupStep(problem), ...out.steps.map((s, i) => toStep(s, i + 1))],
    finalAnswer: out.finalAnswer,
    solution: Object.fromEntries(out.solution.map((s) => [s.symbol.trim(), s.value.trim()])),
    status: "unverified",
    failedChecks: [],
    version,
    repairRounds,
    createdAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
  });
}

// Placeholder teaching a model sometimes produces under pressure (seen in repair rounds).
const PLACEHOLDER =
  /standard processing|final transformation|established context|initial logic|transformation leap|parameters are validated|^final result\.?$|^step \d+\.?$|student'?s \w+ step|^(title|hint|rationale)\.?$/i;

/** Steps whose title or hints aren't real teaching. Not math failures, but just as disqualifying. */
export function qualityIssues(plan: SolutionPlan): { stepIndex: number; detail: string }[] {
  const issues: { stepIndex: number; detail: string }[] = [];
  const counts = new Map<string, number>();
  const key = (h: string) => h.trim().toLowerCase();
  for (const s of plan.steps.slice(1)) for (const h of s.hints) counts.set(key(h), (counts.get(key(h)) ?? 0) + 1);
  for (const s of plan.steps.slice(1)) {
    const problems = new Set<string>();
    if (PLACEHOLDER.test(s.title.trim())) problems.add(`title "${s.title}" is a placeholder`);
    const [h1, h2] = s.hints.map((h) => h.trim());
    if (key(h1) === key(h2)) problems.add("both hints are the same");
    for (const h of [h1, h2]) {
      if (PLACEHOLDER.test(h)) problems.add(`hint "${h}" is a placeholder`);
      else if ((counts.get(key(h)) ?? 0) > 2) problems.add(`hint "${h}" is repeated across steps`);
    }
    if (problems.size) issues.push({ stepIndex: s.index, detail: [...problems].join("; ") });
  }
  return issues;
}

const defects = (plan: SolutionPlan) => [...plan.failedChecks, ...qualityIssues(plan)];

/** The plan as the Planner wrote it (for repair rounds), with step indices. */
function asPlannerJson(plan: SolutionPlan): string {
  return JSON.stringify({
    method: plan.method,
    steps: plan.steps.slice(1).map((s) => ({
      index: s.index,
      kind: s.kind,
      title: s.title,
      latex: s.latex,
      scaffoldLatex: s.scaffoldLatex,
      rationale: s.rationale,
      hint1: s.hints[0],
      hint2: s.hints[1],
      checkQuestion: s.checkQuestion,
      checks: s.verification,
      concepts: s.concepts,
      resultEquation: s.resultEquation,
      fromStudent: s.origin === "student" || undefined,
    })),
    finalAnswer: plan.finalAnswer,
    solution: Object.entries(plan.solution).map(([symbol, value]) => ({ symbol, value })),
  });
}

/** Merge a field-level fix. A placeholder or empty field never replaces the original text. */
function applyFix(step: SolutionStep, fix: StepFix): SolutionStep {
  const keep = (next: string | undefined, original: string) => (next?.trim() && !PLACEHOLDER.test(next.trim()) ? next.trim() : original);
  return {
    ...step,
    verification: fix.checks.map(toCheck),
    resultEquation: fix.resultEquation?.trim() || step.resultEquation,
    latex: fix.latex?.trim() || step.latex,
    scaffoldLatex: fix.scaffoldLatex?.trim() || step.scaffoldLatex,
    title: keep(fix.title, step.title),
    rationale: keep(fix.rationale, step.rationale),
    hints: [keep(fix.hint1, step.hints[0]), keep(fix.hint2, step.hints[1])],
    verifyStatus: "unchecked",
  };
}

/** Diagnostics hook (eval script): sees every round, including the ones that lose. */
export type RoundHook = (round: number, plan: SolutionPlan, quality: { stepIndex: number; detail: string }[]) => void;

/** Lower is better: failed checks and placeholder teaching both count. */
function repairScore(plan: SolutionPlan): number {
  return defects(plan).length;
}

/**
 * Repairs replace only the flagged steps (returned by index) and are merged into the plan, so a
 * repair can never rewrite or thin out steps that were already good.
 */
async function repairLoop(problem: Problem, parts: Part[], first: SolutionPlan, started: number, onRound?: RoundHook): Promise<SolutionPlan> {
  onRound?.(0, first, qualityIssues(first));
  let best = first;
  let current = first;
  for (let round = 1; round <= MAX_REPAIR_ROUNDS && defects(current).length; round++) {
    const flagged = defects(current);
    const indices = new Set(flagged.map((d) => d.stepIndex));
    const list = flagged.map((d) => `- step ${d.stepIndex} (${current.steps[d.stepIndex]?.title ?? "?"}): ${d.detail}`).join("\n");
    const out = await getLLM().structured({
      tier: "strong",
      label: "repair",
      system: PLANNER_SYSTEM,
      schema: RepairOut,
      parts: [...parts, { type: "text", text: `<your_plan>\n${asPlannerJson(current)}\n</your_plan>\n<flagged_steps>\n${list}\n</flagged_steps>\n${REPAIR_INSTRUCTIONS}` }],
    });
    const steps = [...current.steps];
    for (const fix of out.fixes) if (indices.has(fix.index) && fix.index < steps.length) steps[fix.index] = applyFix(steps[fix.index], fix);
    const solution = out.solution?.length ? Object.fromEntries(out.solution.map((x) => [x.symbol.trim(), x.value.trim()])) : current.solution;
    current = verifyPlan({ ...current, steps, solution, repairRounds: round, latencyMs: Date.now() - started });
    onRound?.(round, current, qualityIssues(current));
    if (repairScore(current) < repairScore(best)) best = current;
  }
  return { ...best, latencyMs: Date.now() - started };
}

export async function planSolution(problem: Problem, course: Course, learner: LearnerContext, version: number, onRound?: RoundHook): Promise<SolutionPlan> {
  const started = Date.now();
  const parts = await problemParts(problem, course, learner);
  const out = await getLLM().structured({ tier: "strong", label: "plan", system: PLANNER_SYSTEM, schema: PlannerOut, parts });
  return repairLoop(problem, parts, toPlan(problem, out, version, started, 0), started, onRound);
}

/** Re-plan from the student's own (verified-consistent) lines, keeping their method. */
export async function replanFromStudent(problem: Problem, course: Course, learner: LearnerContext, studentLines: string[], version: number): Promise<SolutionPlan> {
  const started = Date.now();
  const parts = await problemParts(problem, course, learner);
  parts.push({ type: "text", text: `<student_lines>\n${studentLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n</student_lines>\n${REPLAN_FROM_STUDENT}` });
  const out = await getLLM().structured({ tier: "strong", label: "replan", system: PLANNER_SYSTEM, schema: PlannerOut, parts });
  return repairLoop(problem, parts, toPlan(problem, out, version, started, 0), started);
}

/** Too big: split one step into 2–3 verified substeps that reach the same result. */
export async function splitStep(problem: Problem, course: Course, learner: LearnerContext, plan: SolutionPlan, stepIndex: number): Promise<SolutionStep[]> {
  const step = plan.steps[stepIndex];
  const parts = await problemParts(problem, course, learner);
  const context = plan.steps
    .slice(1, stepIndex)
    .map((s) => `${s.index}. ${s.title}: ${s.latex}`)
    .join("\n");
  const ask = (extra = "") =>
    getLLM().structured({
      tier: "strong",
      label: "split",
      system: PLANNER_SYSTEM,
      schema: SplitOut,
      parts: [
        ...parts,
        {
          type: "text",
          text: `<steps_before>\n${context || "(none)"}\n</steps_before>\n<step_to_split>\n${asPlannerJson({ ...plan, steps: [plan.steps[0], step] })}\n</step_to_split>\n<solution>${JSON.stringify(plan.solution)}</solution>\n${SPLIT_INSTRUCTIONS}${extra}`,
        },
      ],
    });

  const build = (out: SplitOut) => {
    const subs = out.steps.map((s, i) => toStep(s, stepIndex + i));
    return subs.map((s, i) => {
      const r = verifyStep(s, plan.solution);
      const failures = [...r.failures];
      // The substeps must land on the original result.
      if (i === subs.length - 1 && step.resultEquation && (!s.resultEquation || !equationsMatch(s.resultEquation, step.resultEquation, Object.keys(plan.solution)))) {
        failures.push("doesn't reach the original step's result");
      }
      return { ...s, verifyStatus: failures.length ? ("failed" as const) : r.status, verifyDetail: failures.join("; ") || undefined };
    });
  };

  let subs = build(await ask());
  const failed = subs.filter((s) => s.verifyStatus === "failed");
  if (failed.length) {
    const detail = failed.map((s) => `- ${s.title}: ${s.verifyDetail}`).join("\n");
    subs = build(await ask(`\n<failed_checks>\n${detail}\n</failed_checks>\nFix these and return the substeps again.`));
  }
  return subs;
}

/** Replace step `stepIndex` with substeps and renumber everything after it. */
export function spliceSteps(plan: SolutionPlan, stepIndex: number, substeps: SolutionStep[]): SolutionPlan {
  const steps = [...plan.steps.slice(0, stepIndex), ...substeps, ...plan.steps.slice(stepIndex + 1)].map((s, i) => ({ ...s, index: i }));
  const failedChecks = steps.filter((s) => s.verifyStatus === "failed").map((s) => ({ stepIndex: s.index, detail: s.verifyDetail ?? "failed" }));
  const mathSteps = steps.filter((s) => s.verifyStatus === "verified" || s.verifyStatus === "failed").length;
  const status: SolutionPlan["status"] = !failedChecks.length ? "verified" : failedChecks.length * 2 > Math.max(1, mathSteps) ? "unverified" : "partially_verified";
  return { ...plan, steps, failedChecks, status, version: plan.version + 1 };
}
