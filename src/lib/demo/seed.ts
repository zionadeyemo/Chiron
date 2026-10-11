import "server-only";
import { db } from "../db";
import type { IntakeOut } from "../board/llm-schemas";
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

/** Problem 7.18 as intake would read it, so seeding a new visitor costs no model call. */
const DEMO_READ: IntakeOut = {
  isProblem: true,
  title: "Propped cantilever with a uniform load",
  statement: PROBLEM_7_18,
  given: ["Propped cantilever $AB$, length $L$, constant $EI$", "Fixed at $A$, roller at $B$", "Uniformly distributed load $w$ over the full length"],
  find: ["Compatibility equation at $B$ with $R_B$ as the redundant", "$R_B$, $R_A$ and $M_A$", "The point of zero bending moment between $A$ and $B$"],
  assumptions: ["Small deflections, linear elastic material (Euler–Bernoulli)"],
};

/**
 * The demo course with Problem 7.18 submitted. `/demo` also sets up the fictional demo learner;
 * a new visitor's automatic demo (`asNewVisitor`) leaves their own learner model untouched.
 */
export async function createDemoCourse(mode: Mode, opts: { asNewVisitor?: boolean } = {}): Promise<string> {
  if (!opts.asNewVisitor) await seedLearnerIfNew();
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
    read: opts.asNewVisitor ? DEMO_READ : undefined,
  });
  return course.id;
}
