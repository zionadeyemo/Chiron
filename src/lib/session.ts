import "server-only";
import {
  applyScoreDelta,
  countWords,
  explainMoreTarget,
  feedbackDelta,
  shortenAfterTooMuch,
  styleToScore,
  targetFor,
} from "./depth";
import { logEvent } from "./events";
import { applyFeedbackEvidence, applyModelUpdates, applyStudentEdit, mergeRelevant } from "./learner";
import { getDocument, getProfile, getSession, newId, updateProfile, updateSession } from "./store";
import { getTutor } from "./tutor";
import { buildBaselineMessage, buildChironPacket } from "./tutor/packet";
import type {
  ConceptState,
  CurrentTask,
  DepthStyle,
  DocumentMeta,
  FeedbackKind,
  Location,
  SessionBundle,
  StudySession,
  Turn,
} from "./types";

export class NotFoundError extends Error {}

async function load(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) throw new NotFoundError("session not found");
  const profile = await getProfile(session.profileId);
  if (!profile) throw new NotFoundError("profile not found");
  return { session, profile };
}

export async function getBundle(sessionId: string): Promise<SessionBundle> {
  const { session, profile } = await load(sessionId);
  const docs = await Promise.all(session.documentIds.map(getDocument));
  return { session, profile, documents: docs.filter((d): d is DocumentMeta => !!d) };
}

// ── Asking ───────────────────────────────────────────────────────────────────

export interface AskInput {
  question: string;
  pointingAt?: string;
  explainMoreOf?: string;
}

export async function ask(sessionId: string, input: AskInput): Promise<SessionBundle> {
  const { session, profile } = await load(sessionId);
  const started = Date.now();
  const parent = input.explainMoreOf ? session.turns.find((t) => t.id === input.explainMoreOf) : undefined;
  if (input.explainMoreOf && !parent) throw new NotFoundError("turn not found");
  const question = parent ? "Explain more" : input.question.trim().slice(0, 2000);
  const pointingAt = input.pointingAt?.trim().slice(0, 1000) || undefined;
  const turnId = newId("t_");

  await logEvent(session, parent ? "explain_more" : "question", {
    turnId,
    parentTurnId: parent?.id,
    chars: question.length,
    pointing: !!pointingAt,
  });

  const tutor = getTutor();
  let turn: Turn;
  let taskUpdate: { currentStep: string | null; task: string | null } | null = null;

  try {
    if (session.mode === "baseline") {
      const parts = await buildBaselineMessage(session, question, pointingAt);
      const history = session.turns.map((t) => ({ question: t.question, response: t.response }));
      const { text, mock } = await tutor.baseline(history, parts);
      turn = baseTurn(turnId, parent, question, pointingAt, text, started, mock);
    } else {
      const target = parent ? explainMoreTarget(parent) : targetFor(session, profile);
      const parts = await buildChironPacket({ session, profile, target, question, pointingAt, explainMoreOf: parent });
      const result = await tutor.chiron(parts, { targetLevel: target.level, maxWords: target.maxWords, explainMore: !!parent });
      const p = result.payload;
      taskUpdate = p.taskUpdate;
      turn = {
        ...baseTurn(turnId, parent, question, pointingAt, p.response, started, result.mock),
        depth: p.explanationDepth,
        targetDepth: target.level,
        wordBudget: target.maxWords,
        sources: p.sources,
        verified: result.mathCalls.some((c) => c.ok),
        mathCalls: result.mathCalls,
        studentClaim: p.studentClaim,
        sideQuestion: p.sideQuestion,
        detectedConcepts: p.detectedConcepts,
      };

      // Learner model: conservative, applied to the freshest profile.
      if (p.knowledgeUpdates.length) {
        let applied: ReturnType<typeof applyModelUpdates> = [];
        await updateProfile(profile.id, (pr) => {
          applied = applyModelUpdates(pr.knowledge, p.knowledgeUpdates);
        });
        for (const a of applied) await logEvent(session, "model_knowledge_update", { turnId, ...a });
      }
      if (p.studentClaim && (p.studentClaim.verdict === "incorrect" || p.studentClaim.verdict === "partly_correct")) {
        await logEvent(session, "wrong_step_caught", { turnId, verdict: p.studentClaim.verdict, claim: p.studentClaim.claim });
      }
    }
  } catch (err) {
    await logEvent(session, "response_error", { turnId, message: (err as Error).message });
    throw err;
  }

  let sideEvent: "side_open" | "side_close" | null = null;
  let newStep: string | null = null;
  await updateSession(sessionId, (s) => {
    const wasOpen = !!s.sideQuestion;
    if (s.mode === "chiron") {
      if (turn.sideQuestion === "open" && !wasOpen) {
        s.sideQuestion = { question, openedAt: turn.at, turnId };
        sideEvent = "side_open";
      } else if (turn.sideQuestion === "close" && wasOpen) {
        s.sideQuestion = null;
        sideEvent = "side_close";
      } else if (turn.sideQuestion === "close") {
        turn.sideQuestion = "none"; // nothing was open; don't render a return
      }
      turn.inSideQuestion = (wasOpen && turn.sideQuestion !== "close") || sideEvent === "side_open";
      if (!parent) s.shortenNext = null;
      s.relevantConcepts = mergeRelevant(s.relevantConcepts, turn.detectedConcepts);
    }
    s.turns.push(turn);
    return s;
  });

  if (sideEvent) await logEvent(session, sideEvent, { turnId });
  // Not during a tangent: the side question isn't a step of the main task.
  if (taskUpdate && !turn.inSideQuestion) newStep = await applyModelTaskUpdate(sessionId, taskUpdate);
  if (newStep) await logEvent(session, "step_change", { by: "model", step: newStep, turnId });

  await logEvent(session, "response", {
    turnId,
    kind: turn.kind,
    words: turn.words,
    depth: turn.depth,
    targetDepth: turn.targetDepth,
    wordBudget: turn.wordBudget,
    verified: turn.verified,
    mathCalls: turn.mathCalls.length,
    latencyMs: turn.latencyMs,
    sources: turn.sources.map((s) => s.type),
    mock: !!turn.mock,
  });

  return getBundle(sessionId);
}

async function applyModelTaskUpdate(
  sessionId: string,
  update: { currentStep: string | null; task: string | null },
): Promise<string | null> {
  let changed: string | null = null;
  await updateSession(sessionId, (s) => {
    if (update.currentStep && update.currentStep !== s.step) {
      s.step = update.currentStep.slice(0, 120);
      changed = s.step;
    }
    if (update.task && s.task.setBy === "model") {
      s.task = { ...s.task, label: update.task.slice(0, 120), setBy: "model" };
    }
  });
  return changed;
}

function baseTurn(
  id: string,
  parent: Turn | undefined,
  question: string,
  pointingAt: string | undefined,
  response: string,
  started: number,
  mock?: boolean,
): Turn {
  return {
    id,
    at: new Date().toISOString(),
    kind: parent ? "explain_more" : "ask",
    question,
    pointingAt,
    parentTurnId: parent?.id,
    response,
    depth: null,
    targetDepth: null,
    wordBudget: null,
    words: countWords(response),
    sources: [],
    verified: false,
    mathCalls: [],
    studentClaim: null,
    sideQuestion: "none",
    inSideQuestion: false,
    detectedConcepts: [],
    feedback: null,
    feedbackDelta: 0,
    flagged: false,
    latencyMs: Date.now() - started,
    ...(mock ? { mock: true } : {}),
  };
}

// ── Depth feedback & flags ───────────────────────────────────────────────────

export async function rate(sessionId: string, turnId: string, kind: FeedbackKind): Promise<SessionBundle> {
  const { session } = await load(sessionId);
  let previous: FeedbackKind | null = null;
  let next: FeedbackKind | null = null;
  let oldDelta = 0;
  let rated: Turn | undefined;

  await updateSession(sessionId, (s) => {
    const t = s.turns.find((x) => x.id === turnId);
    if (!t) throw new NotFoundError("turn not found");
    previous = t.feedback;
    oldDelta = t.feedbackDelta;
    next = previous === kind ? null : kind; // tapping the same rating again clears it
    t.feedback = next;
    if (s.mode === "chiron") {
      if (next === "too_much") s.shortenNext = shortenAfterTooMuch(t);
      else if (previous === "too_much" && s.shortenNext != null) s.shortenNext = null;
    }
    rated = t;
  });

  let scoreBefore: number | null = null;
  let scoreAfter: number | null = null;
  const evidence: ReturnType<typeof applyFeedbackEvidence> = [];
  if (session.mode === "chiron" && rated) {
    const turn = rated as Turn;
    let delta = 0;
    await updateProfile(session.profileId, (p) => {
      scoreBefore = p.depth.score;
      const reverted = applyScoreDelta(p.depth.score, -oldDelta);
      delta = next ? feedbackDelta(next, turn, reverted) : 0;
      p.depth.score = applyScoreDelta(reverted, delta);
      scoreAfter = p.depth.score;
      if (next && next !== "just_right") evidence.push(...applyFeedbackEvidence(p.knowledge, turn.detectedConcepts, next));
    });
    await updateSession(sessionId, (s) => {
      const t = s.turns.find((x) => x.id === turnId);
      if (t) t.feedbackDelta = delta;
    });
  }

  await logEvent(session, "depth_feedback", { turnId, kind: next, previous, scoreBefore, scoreAfter });
  for (const e of evidence) await logEvent(session, "feedback_knowledge_update", { turnId, ...e });
  return getBundle(sessionId);
}

export async function flag(sessionId: string, turnId: string): Promise<SessionBundle> {
  const { session } = await load(sessionId);
  let flagged = false;
  await updateSession(sessionId, (s) => {
    const t = s.turns.find((x) => x.id === turnId);
    if (!t) throw new NotFoundError("turn not found");
    t.flagged = !t.flagged;
    flagged = t.flagged;
  });
  await logEvent(session, "error_flag", { turnId, flagged });
  return getBundle(sessionId);
}

// ── Student edits to session context ─────────────────────────────────────────

export interface SessionPatch {
  location?: Location;
  task?: Partial<Omit<CurrentTask, "setBy">> & { label: string };
  step?: string;
  closeSideQuestion?: boolean;
  addDocument?: string;
}

export async function patchSession(sessionId: string, patch: SessionPatch): Promise<SessionBundle> {
  const { session } = await load(sessionId);
  const events: [Parameters<typeof logEvent>[1], Record<string, unknown>][] = [];

  if (patch.addDocument && !(await getDocument(patch.addDocument))) throw new NotFoundError("document not found");

  await updateSession(sessionId, (s) => {
    if (patch.addDocument && !s.documentIds.includes(patch.addDocument)) {
      s.documentIds.push(patch.addDocument);
      events.push(["material_added", { documentId: patch.addDocument }]);
    }
    if (patch.location) {
      if (!s.documentIds.includes(patch.location.documentId)) throw new NotFoundError("document not in session");
      s.location = { documentId: patch.location.documentId, page: Math.max(1, Math.floor(patch.location.page)) };
      events.push(["location_change", { ...s.location }]);
    }
    if (patch.task) {
      const label = patch.task.label.trim().slice(0, 120);
      if (label) {
        s.task = {
          label,
          text: patch.task.text?.trim().slice(0, 4000) || undefined,
          documentId: patch.task.documentId ?? s.task.documentId,
          page: patch.task.page ?? s.task.page,
          setBy: "student",
        };
        if (patch.task.documentId || patch.task.page) {
          // Marking a new problem resets the step and any tangent.
          s.step = patch.step?.trim() || "Getting started";
          s.sideQuestion = null;
        }
        events.push(["task_change", { by: "student", label, hasText: !!s.task.text }]);
      }
    }
    if (patch.step !== undefined && !patch.task) {
      s.step = patch.step.trim().slice(0, 120);
      events.push(["step_change", { by: "student", step: s.step }]);
    }
    if (patch.closeSideQuestion && s.sideQuestion) {
      s.sideQuestion = null;
      events.push(["side_close", { by: "student" }]);
    }
  });

  for (const [type, data] of events) await logEvent(session, type, data);
  return getBundle(sessionId);
}

export async function editConcept(sessionId: string, concept: string, state: ConceptState | null): Promise<SessionBundle> {
  const { session } = await load(sessionId);
  let change: ReturnType<typeof applyStudentEdit> | null = null;
  await updateProfile(session.profileId, (p) => {
    change = applyStudentEdit(p.knowledge, concept, state);
  });
  if (state) {
    await updateSession(sessionId, (s) => {
      s.relevantConcepts = mergeRelevant(s.relevantConcepts, [concept]);
    });
  }
  if (change) await logEvent(session, "learner_correction", change);
  return getBundle(sessionId);
}

export async function setDepthStyle(sessionId: string, style: DepthStyle): Promise<SessionBundle> {
  const { session } = await load(sessionId);
  await updateProfile(session.profileId, (p) => {
    p.depth = { style, score: styleToScore(style) };
  });
  await updateSession(sessionId, (s) => {
    s.shortenNext = null;
  });
  await logEvent(session, "depth_preference_set", { style, score: styleToScore(style) });
  return getBundle(sessionId);
}

export type { StudySession };
