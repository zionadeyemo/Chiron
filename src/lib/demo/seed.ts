import "server-only";
import { saveDocument, saveProfile, saveSession, newId } from "../store";
import type { KnowledgeState, Mode, StudySession, UserProfile } from "../types";
import { styleToScore } from "../depth";
import {
  DEMO_DOCUMENT_ID,
  DEMO_DOCUMENT_TITLE,
  DEMO_PAGES,
  DEMO_START_PAGE,
  DEMO_STEP,
  DEMO_TASK_LABEL,
  DEMO_TASK_PAGE,
  PROBLEM_7_18,
} from "./chapter7";

export const DEMO_PROFILE_ID = "demo";

function knowledge(entries: Record<string, "known" | "learning" | "uncertain">): KnowledgeState {
  const now = new Date().toISOString();
  return Object.fromEntries(
    Object.entries(entries).map(([k, state]) => [k, { state, source: "profile" as const, updatedAt: now }]),
  );
}

/** Aerospace junior who knows statics, mechanics of materials and linear algebra. */
export function demoProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    id: DEMO_PROFILE_ID,
    major: "Aerospace Engineering",
    year: "Junior",
    course: "AE 3120 Structural Mechanics",
    previousCourses: ["Statics", "Mechanics of Materials", "Linear Algebra", "Calculus III", "Differential Equations"],
    comfortableWith: "Free-body diagrams, shear/moment diagrams, matrix algebra",
    depth: { score: styleToScore("steps"), style: "steps" },
    knowledge: knowledge({
      "static equilibrium": "known",
      "free-body diagrams": "known",
      "shear and moment diagrams": "known",
      "euler-bernoulli bending": "known",
      "cantilever deflection formulas": "known",
      "linear algebra": "known",
      "calculus": "known",
      "stress and strain": "known",
      "method of superposition": "learning",
      "compatibility conditions": "uncertain",
    }),
    createdAt: now,
    updatedAt: now,
  };
}

/** Resets the demo learner and starts a fresh demo session on Problem 7.18. */
export async function createDemoSession(mode: Mode): Promise<StudySession> {
  await saveProfile(demoProfile());
  await saveDocument({
    id: DEMO_DOCUMENT_ID,
    kind: "demo",
    title: DEMO_DOCUMENT_TITLE,
    pageCount: DEMO_PAGES.length,
    pageLabels: DEMO_PAGES.map((p) => p.label),
    createdAt: new Date().toISOString(),
  });
  const now = new Date().toISOString();
  const session: StudySession = {
    id: newId("s_"),
    mode,
    profileId: DEMO_PROFILE_ID,
    course: { name: "Structural Mechanics" },
    documentIds: [DEMO_DOCUMENT_ID],
    location: { documentId: DEMO_DOCUMENT_ID, page: DEMO_START_PAGE },
    task: {
      label: DEMO_TASK_LABEL,
      text: PROBLEM_7_18,
      documentId: DEMO_DOCUMENT_ID,
      page: DEMO_TASK_PAGE,
      setBy: "seed",
    },
    step: DEMO_STEP,
    sideQuestion: null,
    relevantConcepts: [
      "static equilibrium",
      "shear and moment diagrams",
      "euler-bernoulli bending",
      "compatibility conditions",
    ],
    shortenNext: null,
    turns: [],
    isDemo: true,
    startedAt: now,
    lastActiveAt: now,
  };
  await saveSession(session);
  return session;
}
