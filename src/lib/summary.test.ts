import { describe, expect, it } from "vitest";
import type { LoggedEvent } from "./events";
import { problemLine, summarize } from "./summary";

let t = 0;
const ev = (type: LoggedEvent["type"], problemId: string | null, data: Record<string, unknown> = {}, sessionId = "v_1"): LoggedEvent => ({
  at: new Date(Date.UTC(2026, 9, 9, 12, 0, t++)).toISOString(),
  type,
  sessionId,
  courseId: "c_1",
  problemId,
  ...data,
});

describe("validation summary", () => {
  const events: LoggedEvent[] = [
    ev("problem_submitted", "p_a", { source: "text" }),
    ev("setup_shown", "p_a", { latencyMs: 1800 }),
    ev("plan_ready", "p_a", { latencyMs: 9400, steps: 7, status: "verified" }),
    ev("hint_shown", "p_a", { level: 1, stepIndex: 1, beforeFirstStep: true }),
    ev("hint_shown", "p_a", { level: 2, stepIndex: 1, beforeFirstStep: true }),
    ev("next_step", "p_a", { stepIndex: 1 }),
    ev("hint_shown", "p_a", { level: 1, stepIndex: 2, beforeFirstStep: false }),
    ev("next_step", "p_a", { stepIndex: 2 }),
    ev("step_question", "p_a", { stepIndex: 2 }),
    ev("i_got_it", "p_a", { stepsRevealed: 2 }),
    ev("check_work", "p_a", { verdict: "incorrect" }),
    ev("check_work", "p_a", { verdict: "correct" }),
    ev("check_work", "p_a", { verdict: "correct" }),
    ev("problem_completed", "p_a", { by: "student" }),
    ev("problem_submitted", "p_b", { source: "image" }, "v_2"),
    ev("plan_ready", "p_b", { latencyMs: 20000, steps: 4, status: "partially_verified" }, "v_2"),
    ev("next_step", "p_b", { stepIndex: 1 }, "v_2"),
    ev("i_got_it", "p_b", { stepsRevealed: 4 }, "v_2"),
    ev("problem_completed", "p_b", { by: "full_reveal" }, "v_2"),
    { at: "2026-10-01T00:00:00.000Z", type: "setup_shown", latencyMs: 40 } as unknown as LoggedEvent, // V0-era, no ids
  ];
  const { problems, sessions, aggregate } = summarize(events, { problems: { p_a: "Propped cantilever" }, courses: { c_1: "AERO 304" } });
  const a = problems.find((p) => p.problemId === "p_a")!;

  it("computes the per-problem stats from the brief", () => {
    expect(a.stepsInPlan).toBe(7);
    expect(a.revealedBeforeGotIt).toBe(2);
    expect(a.hints).toBe(3);
    expect(a.hintsBeforeStep1).toBe(2);
    expect(a.stepQuestions).toBe(1);
    expect(a.checks).toMatchObject({ total: 3, correct: 2, incorrect: 1 });
    expect(a.setupMs).toBe(1800);
    expect(a.planMs).toBe(9400);
    expect(a.completedBy).toBe("student");
  });

  it("writes the brief's summary lines", () => {
    expect(problemLine(a)).toEqual([
      "Problem: Propped cantilever (AERO 304)",
      'Steps in plan: 7 · Revealed before "I got it": 2 · Hints used: 3 (2 before step 1)',
      "Questions about steps: 1 · Check my work: 3 (2 correct, 1 error caught)",
      "Plan verification: verified · Time to setup: 1.8s · Time to plan: 9.4s · Completed by the student",
    ]);
  });

  it("computes the aggregate view", () => {
    expect(aggregate.problems).toBe(2);
    expect(aggregate.medianRevealedBeforeGotIt).toBe(3); // median of 2 and 4
    expect(aggregate.hintToNextRatio).toBe(1); // 3 hints / 3 next steps
    expect(aggregate.plansFullyVerifiedPct).toBe(50);
    expect(aggregate.completedByStudentPct).toBe(50);
    expect(aggregate.completedByRevealPct).toBe(50);
    expect(aggregate.wrongStepsCaught).toBe(1);
  });

  it("groups by session", () => {
    expect(sessions.map((s) => s.sessionId).sort()).toEqual(["v_1", "v_2"]); // V0 event skipped
    expect(sessions.find((s) => s.sessionId === "v_1")!.problems).toBe(1);
  });
});
