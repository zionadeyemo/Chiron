import "server-only";
import { db } from "../db";
import { normConcept } from "../learner";
import type { ConceptEntry, UserProfile } from "../types";
import { ME } from "../workspace";
import type { Course } from "./types";

// Quiet memory (brief 3.2). The learner model changes only on evidence from what the student
// did — checked work, hints, "I got it", check questions — never from the model's guesses, and
// never over something the student set themselves. It shapes plans and chat; it isn't announced.

export type Evidence = "revealed" | "hint" | "got_it" | "work_correct" | "work_incorrect" | "check_right" | "check_wrong";

/** One-step moves, so a single event never swings a concept from one end to the other. */
const MOVES: Partial<Record<Evidence, Partial<Record<ConceptEntry["state"] | "absent", ConceptEntry["state"]>>>> = {
  work_correct: { uncertain: "learning", learning: "known", absent: "learning" },
  check_right: { uncertain: "learning" },
  got_it: { uncertain: "learning" },
  work_incorrect: { known: "learning" },
  check_wrong: { known: "learning" },
  hint: { absent: "learning" },
};

/** Topics a course has covered: concepts on revealed or checked steps. */
const COVERS: Evidence[] = ["revealed", "work_correct", "got_it"];

export async function recordEvidence(course: Course, concepts: string[], evidence: Evidence): Promise<void> {
  const names = [...new Set(concepts.map(normConcept).filter(Boolean))];
  if (!names.length) return;

  if (COVERS.includes(evidence)) {
    await db()
      .update<Course>("courses", course.id, (c) => {
        const topics = new Set(c.topics ?? []);
        for (const n of names) topics.add(n);
        c.topics = [...topics];
      })
      .catch(() => undefined);
  }

  // Personalization off: the learner model is neither used nor updated for this course.
  if (!course.personalize) return;
  const moves = MOVES[evidence];
  if (!moves) return;
  await db()
    .update<UserProfile>("profiles", ME, (p) => {
      const now = new Date().toISOString();
      for (const name of names) {
        const entry = p.knowledge[name];
        if (entry?.source === "student") continue; // the student's own word wins
        const to = moves[entry?.state ?? "absent"];
        if (to && to !== entry?.state) p.knowledge[name] = { state: to, source: "feedback", updatedAt: now };
      }
      p.updatedAt = now;
    })
    .catch(() => undefined);
}
