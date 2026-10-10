import "server-only";
import { db } from "./db";

// Validation instrumentation (brief, Phase 4). Local, no third-party analytics: one JSONL
// stream per course. Every event carries sessionId (the visit), courseId and problemId.

export type EventType =
  | "problem_submitted"
  | "setup_shown"
  | "plan_ready"
  | "plan_failed"
  | "hint_shown"
  | "next_step"
  | "step_question"
  | "general_question"
  | "explain_more"
  | "i_got_it"
  | "resume_guidance"
  | "check_work"
  | "replan"
  | "step_size_feedback"
  | "check_question_shown"
  | "check_question_answered"
  | "check_question_dismissed"
  | "problem_completed"
  | "new_problem_chip"
  | "learner_correction"
  | "personalize_toggled";

export interface EventContext {
  sessionId: string;
  courseId: string;
  problemId: string | null;
}

export interface LoggedEvent extends EventContext {
  at: string;
  type: EventType;
  [key: string]: unknown;
}

export function logEvent(ctx: EventContext, type: EventType, data: Record<string, unknown> = {}) {
  const event: LoggedEvent = { at: new Date().toISOString(), type, ...ctx, ...data };
  return db().appendEvent(ctx.courseId, event);
}

export async function readEvents(courseId?: string): Promise<LoggedEvent[]> {
  return (await db().readEvents(courseId)) as LoggedEvent[];
}
