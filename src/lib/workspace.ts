import "server-only";
import { baselineTurn, chatTurn } from "./board/chat";
import { looksLikeProblem, readProblem, type IntakeInput } from "./board/intake";
import { decideRoute, ruleIntent, stepRefFrom } from "./board/intent";
import type { IntakeOut } from "./board/llm-schemas";
import { emptyBoard, project } from "./board/project";
export type { WorkspaceView } from "./board/types";
import type {
  ChatMessage,
  CourseSummary,
  WorkspaceView,
  ClientBoard,
  ClientProblemSummary,
  Course,
  Problem,
  ProblemSource,
  SolutionPlan,
  Thread,
  Visit,
  WhiteboardState,
} from "./board/types";
import { db, newId, NotFoundError } from "./db";
import { getDocument } from "./documents";
import { logEvent, type EventContext } from "./events";
import { styleToScore } from "./depth";
import { applyStudentEdit } from "./learner";
import type { ConceptState, DepthStyle, DocumentMeta, Mode, UserProfile } from "./types";
import { currentVisitor } from "./visitor";

// The workspace service: courses, visits, problems, chat threads and message routing.

const VISIT_GAP_MS = 30 * 60 * 1000;
export const ME = "me";
export const SETUP_LINE = "Here's the setup. Want a hint for where to start, or the first step?";

const now = () => new Date().toISOString();

// ── Profile ──────────────────────────────────────────────────────────────────

export async function ensureProfile(): Promise<UserProfile> {
  const existing = await db().get<UserProfile>("profiles", ME);
  if (existing) return existing;
  const profile: UserProfile = {
    id: ME,
    major: "",
    year: "",
    course: "",
    previousCourses: [],
    comfortableWith: "",
    depth: { style: "steps", score: styleToScore("steps") },
    stepSize: 0,
    knowledge: {},
    createdAt: now(),
    updatedAt: now(),
  };
  await db().put("profiles", ME, profile);
  return profile;
}

// ── Courses and visits ───────────────────────────────────────────────────────

export async function createCourse(name: string, mode: Mode = "chiron", documentIds: string[] = []): Promise<Course> {
  const course: Course = {
    id: newId("c_"),
    name: name.trim().slice(0, 120) || "Untitled course",
    archived: false,
    personalize: true,
    mode,
    activeProblemId: null,
    documentIds,
    lastVisitId: null,
    createdAt: now(),
    lastOpenedAt: now(),
  };
  await db().put("courses", course.id, course);
  return course;
}

// A visitor's first visit seeds the demo course, scoped to them. Deduplicated per visitor within
// this server instance (the home page can ask twice in quick succession).
const seeding = new Map<string, Promise<void>>();

async function seedNewVisitor(): Promise<void> {
  if (await db().get<UserProfile>("profiles", ME)) return;
  const visitorId = await currentVisitor();
  let pending = seeding.get(visitorId);
  if (!pending) {
    pending = (async () => {
      await ensureProfile();
      const { createDemoCourse } = await import("./demo/seed");
      await createDemoCourse("chiron", { asNewVisitor: true });
    })().finally(() => seeding.delete(visitorId));
    seeding.set(visitorId, pending);
  }
  await pending;
}

export async function listCourses(): Promise<CourseSummary[]> {
  await seedNewVisitor();
  const [courses, problems, boards, visits] = await Promise.all([
    db().list<Course>("courses"),
    db().list<Problem>("problems"),
    db().list<WhiteboardState>("boards"),
    db().list<Visit>("visits"),
  ]);
  const boardOf = new Map(boards.map((b) => [b.problemId, b]));
  return courses
    .map((course) => {
      const own = problems.filter((p) => p.courseId === course.id);
      const lastActivity = [course.lastOpenedAt, ...own.map((p) => p.updatedAt)].sort().at(-1)!;
      const status = { in_progress: 0, solved: 0, independent: 0 };
      for (const p of own) status[summaryStatus(boardOf.get(p.id) ?? null)]++;
      return { course, problemCount: own.length, status, sessions: visits.filter((v) => v.courseId === course.id).length, lastActivity };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export async function attachDocument(courseId: string, documentId: string) {
  if (!(await getDocument(documentId))) throw new NotFoundError("document not found");
  await db().update<Course>("courses", courseId, (c) => {
    if (!c.documentIds.includes(documentId)) c.documentIds.push(documentId);
  });
}

export async function getCourse(id: string): Promise<Course> {
  const course = await db().get<Course>("courses", id);
  if (!course) throw new NotFoundError("course not found");
  return course;
}

/** Opening a course after 30 minutes away starts a new visit (the brief's "session"). */
export async function startOrResumeVisit(courseId: string): Promise<string> {
  const course = await getCourse(courseId);
  const last = course.lastVisitId ? await db().get<Visit>("visits", course.lastVisitId) : null;
  if (last && Date.now() - Date.parse(last.lastActiveAt) < VISIT_GAP_MS) {
    await touchVisit(last.id);
    return last.id;
  }
  const visit: Visit = { id: newId("v_"), courseId, startedAt: now(), lastActiveAt: now() };
  await db().put("visits", visit.id, visit);
  await db().update<Course>("courses", courseId, (c) => {
    c.lastVisitId = visit.id;
    c.lastOpenedAt = now();
  });
  return visit.id;
}

async function touchVisit(id: string) {
  await db()
    .update<Visit>("visits", id, (v) => {
      v.lastActiveAt = now();
    })
    .catch(() => undefined);
}

// ── Threads ──────────────────────────────────────────────────────────────────

const threadId = (courseId: string, problemId: string | null) => problemId ?? `course:${courseId}`;

async function getThread(courseId: string, problemId: string | null): Promise<Thread> {
  const id = threadId(courseId, problemId);
  return (await db().get<Thread>("threads", id)) ?? { id, courseId, messages: [] };
}

export async function append(courseId: string, problemId: string | null, ...messages: ChatMessage[]) {
  const id = threadId(courseId, problemId);
  const existing = await db().get<Thread>("threads", id);
  if (!existing) await db().put<Thread>("threads", id, { id, courseId, messages: [] });
  await db().update<Thread>("threads", id, (t) => {
    t.messages.push(...messages);
  });
}

export const chironMessage = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: newId("m_"), role: "chiron", text, at: now(), ...extra });
const chiron = chironMessage;

// ── Problems ─────────────────────────────────────────────────────────────────

export async function loadProblemState(problemId: string) {
  const problem = await db().get<Problem>("problems", problemId);
  if (!problem) throw new NotFoundError("problem not found");
  const [plan, board] = await Promise.all([
    db().get<SolutionPlan>("plans", problemId),
    db().get<WhiteboardState>("boards", problemId),
  ]);
  return { problem, plan, board: board ?? emptyBoard(problemId) };
}

function summaryStatus(board: WhiteboardState | null): ClientProblemSummary["status"] {
  if (board?.completed) return "solved";
  if (board?.studentMode === "independent") return "independent";
  return "in_progress";
}

export interface SubmitInput extends IntakeInput {
  source: ProblemSource;
  studentMessage?: ChatMessage;
  /** Already read by intake (auto-detected problems), to avoid reading twice. */
  read?: IntakeOut;
  /** When the student sent it, so time-to-setup includes reading the problem. */
  startedAt?: number;
}

export async function submitProblem(courseId: string, sessionId: string, input: SubmitInput): Promise<Problem> {
  const course = await getCourse(courseId);
  const started = input.startedAt ?? Date.now();
  const ctx: EventContext = { sessionId, courseId, problemId: null };
  const read = input.read ?? (await readProblem(input));
  const problem: Problem = {
    id: newId("p_"),
    courseId,
    sessionId,
    source: input.source,
    title: read.title || "Problem",
    statement: read.statement || input.text || "",
    imageRef: input.imageRefs?.[0],
    pdfRef: input.pdf,
    setup: course.mode === "baseline" ? null : { given: read.given, find: read.find, assumptions: read.assumptions },
    status: course.mode === "baseline" ? "ready" : "planning",
    createdAt: now(),
    updatedAt: now(),
  };
  ctx.problemId = problem.id;
  await db().put("problems", problem.id, problem);
  await db().put("boards", problem.id, emptyBoard(problem.id));
  await db().update<Course>("courses", courseId, (c) => {
    c.activeProblemId = problem.id;
  });
  await logEvent(ctx, "problem_submitted", { source: input.source });

  const opening = input.studentMessage ? [input.studentMessage] : [];
  if (course.mode === "baseline") {
    // The comparison arm answers the pasted problem like a plain chat tutor would.
    const profile = await ensureProfile();
    const message = input.studentMessage ?? { id: newId("m_"), role: "student" as const, text: problem.statement, at: now() };
    const text = await baselineTurn({ course, profile, problem, plan: null, board: null, history: [], message });
    await append(courseId, problem.id, ...opening, chiron(text));
  } else {
    await append(courseId, problem.id, ...opening, chiron(SETUP_LINE));
    await logEvent(ctx, "setup_shown", { latencyMs: Date.now() - started });
  }
  await touchVisit(sessionId);
  return problem;
}

/** The student fixed a misread statement: re-read the setup from the corrected text. */
export async function editStatement(problemId: string, statement: string, sessionId: string): Promise<Problem> {
  const { problem } = await loadProblemState(problemId);
  const read = await readProblem({ text: statement });
  const updated = await db().update<Problem>("problems", problem.id, (p) => {
    p.statement = statement.trim();
    p.title = read.title || p.title;
    if (p.setup) p.setup = { given: read.given, find: read.find, assumptions: read.assumptions };
    p.updatedAt = now();
  });
  // A corrected statement means a new plan (brief 1.3).
  if (updated.setup) {
    const { resetForReplan } = await import("./board/actions");
    await resetForReplan(problem.id, { sessionId, courseId: problem.courseId, problemId: problem.id });
  }
  await touchVisit(sessionId);
  return updated;
}

export async function selectProblem(courseId: string, problemId: string) {
  const { problem } = await loadProblemState(problemId);
  if (problem.courseId !== courseId) throw new NotFoundError("problem not in course");
  await db().update<Course>("courses", courseId, (c) => {
    c.activeProblemId = problemId;
  });
}

// ── The view the client renders ──────────────────────────────────────────────

export async function getView(courseId: string, sessionId: string): Promise<WorkspaceView> {
  const course = await getCourse(courseId);
  const problems = (await db().list<Problem>("problems", (p) => p.courseId === courseId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const boards = await Promise.all(problems.map((p) => db().get<WhiteboardState>("boards", p.id)));
  let board: ClientBoard | null = null;
  if (course.activeProblemId) {
    const state = await loadProblemState(course.activeProblemId).catch(() => null);
    if (state) board = project(state.problem, state.plan, state.board);
  }
  const thread = await getThread(courseId, board ? course.activeProblemId : null);
  const documents = (await Promise.all(course.documentIds.map(getDocument))).filter((d): d is DocumentMeta => !!d);
  const profile = await ensureProfile();
  const topics = course.topics ?? [];
  return {
    course,
    sessionId,
    problems: problems.map((p, i) => ({ id: p.id, title: p.title, source: p.source, createdAt: p.createdAt, status: summaryStatus(boards[i]) })),
    board,
    messages: thread.messages,
    documents,
    assumptions: {
      // This course's topics first, then everything else Chiron assumes about the student.
      concepts: Object.entries(profile.knowledge)
        .map(([name, e]) => ({ name, state: e.state, source: e.source, inCourse: topics.includes(name) }))
        .sort((a, b) => Number(b.inCourse) - Number(a.inCourse) || a.name.localeCompare(b.name)),
      topics,
      depthStyle: profile.depth.style,
    },
  };
}

// ── Course settings and the learner model (Phase 3) ──────────────────────────

export async function updateCourse(courseId: string, sessionId: string, patch: { name?: string; archived?: boolean; personalize?: boolean }): Promise<Course> {
  const before = await getCourse(courseId);
  const course = await db().update<Course>("courses", courseId, (c) => {
    if (patch.name?.trim()) c.name = patch.name.trim().slice(0, 120);
    if (patch.archived !== undefined) c.archived = patch.archived;
    if (patch.personalize !== undefined) c.personalize = patch.personalize;
  });
  if (patch.personalize !== undefined && patch.personalize !== before.personalize) {
    await logEvent({ sessionId, courseId, problemId: course.activeProblemId }, "personalize_toggled", { personalize: patch.personalize });
  }
  return course;
}

/** The student corrects what Chiron assumes. Their word always wins over inferred evidence. */
export async function editConcept(courseId: string, sessionId: string, concept: string, state: ConceptState | null) {
  const course = await getCourse(courseId);
  let change: ReturnType<typeof applyStudentEdit> | null = null;
  await db().update<UserProfile>("profiles", ME, (p) => {
    change = applyStudentEdit(p.knowledge, concept, state);
    p.updatedAt = now();
  });
  await logEvent({ sessionId, courseId, problemId: course.activeProblemId }, "learner_correction", { ...change! });
}

export async function setDepthStyle(style: DepthStyle) {
  await db().update<UserProfile>("profiles", ME, (p) => {
    p.depth = { style, score: styleToScore(style) };
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────

export interface MessageInput {
  sessionId: string;
  text: string;
  imageRefs: string[];
  mode: "normal" | "new_problem" | "my_work";
  explainMoreOf?: string;
}

export async function sendMessage(courseId: string, input: MessageInput): Promise<void> {
  const startedAt = Date.now();
  const course = await getCourse(courseId);
  const profile = await ensureProfile();
  const text = input.text.trim().slice(0, 8000);
  const imageRefs = input.imageRefs.slice(0, 4);
  const student: ChatMessage = { id: newId("m_"), role: "student", text, imageRefs: imageRefs.length ? imageRefs : undefined, at: now(), mode: input.mode };
  await touchVisit(input.sessionId);

  if (input.mode === "new_problem") {
    await submitProblem(courseId, input.sessionId, { source: imageRefs.length ? "image" : "text", text, imageRefs, studentMessage: student, startedAt });
    return;
  }

  const state = course.activeProblemId ? await loadProblemState(course.activeProblemId).catch(() => null) : null;
  const problemId = state?.problem.id ?? null;
  const ctx: EventContext = { sessionId: input.sessionId, courseId, problemId };
  const thread = await getThread(courseId, problemId);

  // No problem yet: the first problem-like submission becomes the problem.
  if (!state && !input.explainMoreOf && looksLikeProblem(text, imageRefs.length > 0)) {
    const read = await readProblem({ text, imageRefs });
    if (read.isProblem) {
      await submitProblem(courseId, input.sessionId, { source: imageRefs.length ? "image" : "text", text, imageRefs, studentMessage: student, read, startedAt });
      return;
    }
  }

  const explainMoreOf = input.explainMoreOf ? thread.messages.find((m) => m.id === input.explainMoreOf && m.role === "chiron") : undefined;
  if (input.explainMoreOf && !explainMoreOf) throw new NotFoundError("message not found");
  const chatCtx = {
    course,
    profile,
    problem: state?.problem ?? null,
    plan: state?.plan ?? null,
    board: state?.board ?? null,
    history: thread.messages,
    message: student,
    explainMoreOf,
  };

  if (course.mode === "baseline") {
    const reply = await baselineTurn(chatCtx);
    await append(courseId, problemId, ...(explainMoreOf ? [] : [student]), chiron(reply, explainMoreOf ? { explainMoreOf: explainMoreOf.id } : {}));
    return;
  }

  const board = await import("./board/actions");

  if (explainMoreOf) {
    const { out, targetLevel } = await chatTurn(chatCtx);
    await append(courseId, problemId, chiron(out.reply, { depth: out.depth ?? targetLevel, explainMoreOf: explainMoreOf.id, stepRef: out.stepRef ?? null }));
    await logEvent(ctx, "explain_more", { messageId: explainMoreOf.id, depth: out.depth, personalized: course.personalize });
    return;
  }

  // Unambiguous messages ("next", "hint", "I got R_B = …") are routed without a model call.
  const rule = input.mode === "my_work" ? null : ruleIntent(text, { hasProblem: !!state, hasImages: imageRefs.length > 0 });
  const chat = rule || input.mode === "my_work" ? null : await chatTurn(chatCtx);
  const intent = rule?.intent ?? chat?.out.intent ?? "student_work";
  const stepRef = rule?.stepRef ?? chat?.out.stepRef ?? stepRefFrom(text);
  const route = decideRoute(intent, { hasProblem: !!state, mode: input.mode, stepRef });

  switch (route.kind) {
    case "submit_problem":
      await submitProblem(courseId, input.sessionId, { source: imageRefs.length ? "image" : "text", text, imageRefs, studentMessage: student, startedAt });
      return;
    case "chip":
      // Never switch automatically: ask.
      await append(courseId, problemId, { ...student, chip: { type: "new_problem", text, imageRefs } });
      await logEvent(ctx, "new_problem_chip");
      return;
    case "next_step":
    case "hint": {
      await append(courseId, problemId, student);
      const say = await board.actFromChat(problemId!, input.sessionId, route.kind === "hint" ? "hint" : "next");
      await append(courseId, problemId, chiron(say));
      return;
    }
    case "check_work":
      await append(courseId, problemId, { ...student, mode: "my_work" });
      try {
        await board.runCheckWork(problemId!, input.sessionId, text, imageRefs);
      } catch (err) {
        if (!(err instanceof board.BoardError)) throw err;
        await append(courseId, problemId, chiron(err.message));
      }
      return;
    case "answer": {
      const out = chat?.out ?? (await chatTurn(chatCtx)).out;
      await append(courseId, problemId, student, chiron(out.reply, { depth: out.depth, stepRef: out.stepRef ?? route.stepRef ?? null }));
      await logEvent(ctx, intent === "question_about_step" ? "step_question" : "general_question", { stepIndex: out.stepRef ?? route.stepRef ?? null, personalized: course.personalize });
      return;
    }
  }
}

/** The student answered "Start this as a new problem?" */
export async function resolveChip(courseId: string, sessionId: string, messageId: string, answer: "yes" | "no"): Promise<void> {
  const course = await getCourse(courseId);
  const problemId = course.activeProblemId;
  const thread = await getThread(courseId, problemId);
  const message = thread.messages.find((m) => m.id === messageId && m.chip && !m.chip.resolved);
  if (!message?.chip) throw new NotFoundError("nothing to resolve");
  const chip = message.chip;
  await db().update<Thread>("threads", thread.id, (t) => {
    const m = t.messages.find((x) => x.id === messageId);
    if (m?.chip) m.chip.resolved = answer;
  });
  if (answer === "yes") {
    await submitProblem(courseId, sessionId, { source: chip.imageRefs.length ? "image" : "text", text: chip.text, imageRefs: chip.imageRefs });
    return;
  }
  const state = problemId ? await loadProblemState(problemId) : null;
  const profile = await ensureProfile();
  const { out } = await chatTurn({
    course,
    profile,
    problem: state?.problem ?? null,
    plan: state?.plan ?? null,
    board: state?.board ?? null,
    history: thread.messages,
    message,
    notNewProblem: true,
  });
  await append(courseId, problemId, chiron(out.reply, { depth: out.depth, stepRef: out.stepRef ?? null }));
}
