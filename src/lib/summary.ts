import type { LoggedEvent } from "./events";

// Validation metrics (brief, Phase 4), computed from the event log. Pure: callers pass events
// plus names, so it's testable without storage.

export interface ProblemStats {
  problemId: string;
  title: string;
  courseName: string;
  sessionIds: string[];
  stepsInPlan: number | null;
  /** Steps revealed at the student's first "I got it" — the key metric. null if never pressed. */
  revealedBeforeGotIt: number | null;
  hints: number;
  hintsBeforeStep1: number;
  nextSteps: number;
  stepQuestions: number;
  explainMore: number;
  checks: { total: number; correct: number; incorrect: number; differentMethod: number; unclear: number };
  replans: Record<string, number>;
  stepSize: { tooBig: number; tooSmall: number };
  checkQuestions: { shown: number; answered: number; dismissed: number };
  verification: string | null;
  setupMs: number | null;
  planMs: number | null;
  completedBy: "student" | "full_reveal" | null;
  firstAt: string;
  lastAt: string;
}

export interface SessionStats {
  sessionId: string;
  courseName: string;
  startedAt: string;
  minutes: number;
  problems: number;
  events: number;
}

export interface Aggregate {
  problems: number;
  medianRevealedBeforeGotIt: number | null;
  gotItCount: number;
  hintToNextRatio: number | null;
  plansFullyVerifiedPct: number | null;
  plans: number;
  completed: number;
  completedByStudentPct: number | null;
  completedByRevealPct: number | null;
  wrongStepsCaught: number;
  medianSetupMs: number | null;
  medianPlanMs: number | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export function summarize(events: LoggedEvent[], names: { problems: Record<string, string>; courses: Record<string, string> }) {
  // V0-era events carry no session or course; they predate these metrics.
  const sorted = events.filter((e) => e.sessionId && e.courseId).sort((a, b) => a.at.localeCompare(b.at));
  const byProblem = new Map<string, LoggedEvent[]>();
  for (const e of sorted) if (e.problemId) byProblem.set(e.problemId, [...(byProblem.get(e.problemId) ?? []), e]);

  const problems: ProblemStats[] = [...byProblem.entries()].map(([problemId, es]) => {
    const of = (t: string) => es.filter((e) => e.type === t);
    const lastPlan = of("plan_ready").at(-1);
    const gotIt = of("i_got_it")[0];
    const checks = of("check_work");
    const completed = of("problem_completed")[0];
    const replans: Record<string, number> = {};
    for (const r of of("replan")) replans[String(r.reason)] = (replans[String(r.reason)] ?? 0) + 1;
    return {
      problemId,
      title: names.problems[problemId] ?? problemId,
      courseName: names.courses[es[0].courseId] ?? es[0].courseId,
      sessionIds: [...new Set(es.map((e) => e.sessionId))],
      stepsInPlan: lastPlan ? Number(lastPlan.steps) : null,
      revealedBeforeGotIt: gotIt ? Number(gotIt.stepsRevealed) : null,
      hints: of("hint_shown").length,
      hintsBeforeStep1: of("hint_shown").filter((e) => e.beforeFirstStep).length,
      nextSteps: of("next_step").length,
      stepQuestions: of("step_question").length,
      explainMore: of("explain_more").length,
      checks: {
        total: checks.length,
        correct: checks.filter((e) => e.verdict === "correct").length,
        incorrect: checks.filter((e) => e.verdict === "incorrect").length,
        differentMethod: checks.filter((e) => e.verdict === "different_method").length,
        unclear: checks.filter((e) => e.verdict === "unclear").length,
      },
      replans,
      stepSize: { tooBig: of("step_size_feedback").filter((e) => e.kind === "too_big").length, tooSmall: of("step_size_feedback").filter((e) => e.kind === "too_small").length },
      checkQuestions: { shown: of("check_question_shown").length, answered: of("check_question_answered").length, dismissed: of("check_question_dismissed").length },
      verification: lastPlan ? String(lastPlan.status) : null,
      setupMs: of("setup_shown")[0] ? Number(of("setup_shown")[0].latencyMs) : null,
      planMs: lastPlan ? Number(lastPlan.latencyMs) : null,
      completedBy: completed ? (completed.by === "student" ? "student" : "full_reveal") : null,
      firstAt: es[0].at,
      lastAt: es.at(-1)!.at,
    };
  });
  problems.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const bySession = new Map<string, LoggedEvent[]>();
  for (const e of sorted) bySession.set(e.sessionId, [...(bySession.get(e.sessionId) ?? []), e]);
  const sessions: SessionStats[] = [...bySession.entries()]
    .map(([sessionId, es]) => ({
      sessionId,
      courseName: names.courses[es[0].courseId] ?? es[0].courseId,
      startedAt: es[0].at,
      minutes: Math.round((Date.parse(es.at(-1)!.at) - Date.parse(es[0].at)) / 6000) / 10,
      problems: new Set(es.map((e) => e.problemId).filter(Boolean)).size,
      events: es.length,
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const all = (t: string) => sorted.filter((e) => e.type === t);
  const plans = all("plan_ready");
  const completed = problems.filter((p) => p.completedBy);
  const aggregate: Aggregate = {
    problems: problems.length,
    medianRevealedBeforeGotIt: median(problems.flatMap((p) => (p.revealedBeforeGotIt == null ? [] : [p.revealedBeforeGotIt]))),
    gotItCount: problems.filter((p) => p.revealedBeforeGotIt != null).length,
    hintToNextRatio: all("next_step").length ? Math.round((all("hint_shown").length / all("next_step").length) * 100) / 100 : null,
    plansFullyVerifiedPct: pct(plans.filter((e) => e.status === "verified").length, plans.length),
    plans: plans.length,
    completed: completed.length,
    completedByStudentPct: pct(completed.filter((p) => p.completedBy === "student").length, completed.length),
    completedByRevealPct: pct(completed.filter((p) => p.completedBy === "full_reveal").length, completed.length),
    wrongStepsCaught: all("check_work").filter((e) => e.verdict === "incorrect").length,
    medianSetupMs: median(problems.flatMap((p) => (p.setupMs == null ? [] : [p.setupMs]))),
    medianPlanMs: median(problems.flatMap((p) => (p.planMs == null ? [] : [p.planMs]))),
  };

  return { problems, sessions, aggregate };
}

/** The brief's one-paragraph line for a problem. */
export function problemLine(p: ProblemStats): string[] {
  const s = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
  return [
    `Problem: ${p.title} (${p.courseName})`,
    `Steps in plan: ${p.stepsInPlan ?? "—"} · Revealed before "I got it": ${p.revealedBeforeGotIt ?? "never pressed"} · Hints used: ${p.hints} (${p.hintsBeforeStep1} before step 1)`,
    `Questions about steps: ${p.stepQuestions} · Check my work: ${p.checks.total} (${p.checks.correct} correct, ${p.checks.incorrect} ${p.checks.incorrect === 1 ? "error" : "errors"} caught${p.checks.differentMethod ? `, ${p.checks.differentMethod} different method` : ""})`,
    `Plan verification: ${p.verification ?? "—"} · Time to setup: ${s(p.setupMs)} · Time to plan: ${s(p.planMs)}${p.completedBy ? ` · Completed by ${p.completedBy === "student" ? "the student" : "full reveal"}` : ""}`,
  ];
}
