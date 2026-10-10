import "server-only";
import { db } from "../db";
import type { DocumentMeta, KnowledgeState, Mode, UserProfile } from "../types";
import { createCourse, ensureProfile, startOrResumeVisit, submitProblem } from "../workspace";
import { DEMO_DOCUMENT_ID, DEMO_DOCUMENT_TITLE, DEMO_PAGES, DEMO_TASK_PAGE, PROBLEM_7_18 } from "./chapter7";

// The demo: an aerospace junior who knows statics, mechanics of materials and linear algebra,
// in a Structural Mechanics course with Chapter 7 as material and Problem 7.18 submitted.

function knowledge(entries: Record<string, "known" | "learning" | "uncertain">): KnowledgeState {
  const at = new Date().toISOString();
  return Object.fromEntries(Object.entries(entries).map(([k, state]) => [k, { state, source: "profile" as const, updatedAt: at }]));
}

async function seedLearnerIfNew(): Promise<void> {
  const profile = await ensureProfile();
  if (profile.major || Object.keys(profile.knowledge).length) return; // a real student already set up: leave them be
  await db().update<UserProfile>("profiles", profile.id, (p) => {
    p.major = "Aerospace Engineering";
    p.year = "Junior";
    p.previousCourses = ["Statics", "Mechanics of Materials", "Linear Algebra", "Calculus III", "Differential Equations"];
    p.knowledge = knowledge({
      "static equilibrium": "known",
      "free-body diagrams": "known",
      "shear and moment diagrams": "known",
      "euler-bernoulli bending": "known",
      "cantilever deflection": "known",
      "linear algebra": "known",
      "method of superposition": "learning",
      "compatibility conditions": "uncertain",
    });
  });
}

export async function createDemoCourse(mode: Mode): Promise<string> {
  await seedLearnerIfNew();
  const doc: DocumentMeta = {
    id: DEMO_DOCUMENT_ID,
    kind: "demo",
    title: DEMO_DOCUMENT_TITLE,
    pageCount: DEMO_PAGES.length,
    pageLabels: DEMO_PAGES.map((p) => p.label),
    createdAt: new Date().toISOString(),
  };
  await db().put("documents", doc.id, doc);
  const course = await createCourse("AE 3120 — Structural Mechanics", mode, [doc.id]);
  const sessionId = await startOrResumeVisit(course.id);
  await submitProblem(course.id, sessionId, {
    source: "pdf",
    pdf: { docId: DEMO_DOCUMENT_ID, page: DEMO_TASK_PAGE },
    text: PROBLEM_7_18,
  });
  return course.id;
}
