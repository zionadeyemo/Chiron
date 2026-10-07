import "server-only";
import { appendEvent, readEvents } from "./store";
import type { StudySession } from "./types";

// Local, non-invasive research log: one JSONL file per session. No content beyond what
// the student typed into Chiron, no device or identity data.

export type EventType =
  | "session_start"
  | "question"
  | "explain_more"
  | "response"
  | "response_error"
  | "depth_feedback"
  | "learner_correction"
  | "depth_preference_set"
  | "model_knowledge_update"
  | "feedback_knowledge_update"
  | "side_open"
  | "side_close"
  | "error_flag"
  | "wrong_step_caught"
  | "task_change"
  | "step_change"
  | "location_change"
  | "material_added";

export function logEvent(session: Pick<StudySession, "id" | "mode">, type: EventType, data: Record<string, unknown> = {}) {
  return appendEvent(session.id, { at: new Date().toISOString(), type, mode: session.mode, ...data });
}

export interface SessionSummary {
  mode: StudySession["mode"];
  durationMinutes: number;
  questions: number;
  responses: number;
  avgWords: number;
  medianWords: number;
  depthCounts: Record<string, number>;
  feedback: { too_much: number; just_right: number; too_little: number; unrated: number };
  explainMore: number;
  learnerCorrections: number;
  contextCorrections: number;
  sideOpened: number;
  sideClosed: number;
  flaggedErrors: number;
  wrongStepsCaught: number;
  verifiedResponses: number;
  responsesWithCalculations: number;
  sentence: string;
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export async function summarize(session: StudySession): Promise<SessionSummary> {
  const events = await readEvents(session.id);
  const count = (t: EventType) => events.filter((e) => e.type === t).length;
  const turns = session.turns;

  const times = events.map((e) => Date.parse(String(e.at))).filter(Number.isFinite);
  const start = Date.parse(session.startedAt);
  const end = times.length ? Math.max(...times) : start;
  const words = turns.map((t) => t.words).sort((a, b) => a - b);
  const avgWords = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0;
  const medianWords = words.length ? words[Math.floor(words.length / 2)] : 0;

  const depthCounts: Record<string, number> = {};
  for (const t of turns) {
    const k = t.depth == null ? "n/a" : `L${t.depth}`;
    depthCounts[k] = (depthCounts[k] ?? 0) + 1;
  }
  const feedback = { too_much: 0, just_right: 0, too_little: 0, unrated: 0 };
  for (const t of turns) feedback[t.feedback ?? "unrated"]++;

  const s: Omit<SessionSummary, "sentence"> = {
    mode: session.mode,
    durationMinutes: Math.max(0, Math.round((end - start) / 6000) / 10),
    questions: turns.filter((t) => t.kind === "ask").length,
    responses: turns.length,
    avgWords,
    medianWords,
    depthCounts,
    feedback,
    explainMore: turns.filter((t) => t.kind === "explain_more").length,
    learnerCorrections: count("learner_correction"),
    contextCorrections: events.filter((e) => (e.type === "task_change" || e.type === "step_change") && e.by === "student").length,
    sideOpened: count("side_open"),
    sideClosed: count("side_close"),
    flaggedErrors: turns.filter((t) => t.flagged).length,
    wrongStepsCaught: turns.filter((t) => t.studentClaim && t.studentClaim.verdict !== "correct" && t.studentClaim.verdict !== "unverifiable").length,
    verifiedResponses: turns.filter((t) => t.verified).length,
    responsesWithCalculations: turns.filter((t) => t.mathCalls.length > 0).length,
  };

  const sentence = [
    `${plural(s.questions, "question")} in ${s.durationMinutes} min (${s.mode}).`,
    `Average response ${s.avgWords} words.`,
    `Depth feedback: ${s.feedback.just_right} just right, ${s.feedback.too_much} too much, ${s.feedback.too_little} too little.`,
    `${plural(s.explainMore, "explain-more request")}.`,
    `${plural(s.learnerCorrections, "knowledge assumption")} corrected.`,
    `${plural(s.wrongStepsCaught, "wrong student step")} caught.`,
    `${plural(s.flaggedErrors, "error")} flagged by the student.`,
  ].join(" ");

  return { ...s, sentence };
}
