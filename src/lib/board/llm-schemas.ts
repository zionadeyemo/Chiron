import { z } from "zod";

// Schemas for what the model returns. Kept flat (no unions) so every provider's JSON-schema
// subset accepts them; converted to domain types after validation.

const mdLine = z.string().min(1).max(400);

export const IntakeOut = z.object({
  isProblem: z.boolean().describe("false if this isn't a problem to solve (e.g. a general question or unreadable image)"),
  title: z.string().min(1).max(80).describe("Short plain-text label, no LaTeX"),
  statement: z.string().min(1).max(6000).describe("The full problem statement as written, math in $...$"),
  given: z.array(mdLine).max(16),
  find: z.array(mdLine).min(1).max(8),
  assumptions: z.array(mdLine).max(6),
});
export type IntakeOut = z.infer<typeof IntakeOut>;

export const INTENTS = [
  "question_about_step",
  "ask_next_step",
  "ask_hint",
  "student_work",
  "new_problem",
  "general_question",
  "other",
] as const;
export type Intent = (typeof INTENTS)[number];

export const ChatOut = z.object({
  intent: z.enum(INTENTS),
  stepRef: z.number().int().min(0).optional().describe("Board step the message is about, if any"),
  reply: z.string().max(4000).describe("What the student sees. Empty for ask_next_step, ask_hint, student_work and new_problem."),
  depth: z.number().int().min(1).max(4),
  containsCalculation: z.boolean(),
});
export type ChatOut = z.infer<typeof ChatOut>;

// ── Planner ──────────────────────────────────────────────────────────────────

export const PlannerCheck = z.object({
  type: z.enum(["numeric", "equivalence", "none"]),
  expr: z.string().optional().describe("numeric: mathjs expression that evaluates to `expected`"),
  expected: z.number().optional(),
  tolerance: z.number().optional().describe("numeric: relative tolerance; omit for the 1e-6 default"),
  units: z.string().optional().describe("numeric: unit to convert expr into before comparing, if expr uses mathjs units"),
  lhs: z.string().optional().describe("equivalence: mathjs expression"),
  rhs: z.string().optional().describe("equivalence: mathjs expression that must equal lhs for all values of `variables`"),
  variables: z.array(z.string()).optional(),
  reason: z.string().optional().describe("none: why this step has no math to check"),
});
export type PlannerCheck = z.infer<typeof PlannerCheck>;

export const PlannerStep = z.object({
  kind: z.enum(["equation", "substitution", "algebra", "concept", "scaffold", "result"]),
  title: z.string().min(1).max(80),
  latex: z.string().min(1).max(3000).describe("What is written on the board: display LaTeX, no surrounding $$"),
  scaffoldLatex: z.string().max(3000).optional().describe("scaffold only: the structure with \blank for empty slots"),
  rationale: z.string().min(1).max(600),
  hint1: z.string().min(1).max(300),
  hint2: z.string().min(1).max(300),
  checkQuestion: z.string().max(300).optional(),
  checks: z.array(PlannerCheck).min(1).max(6),
  concepts: z.array(z.string()).max(6),
  resultEquation: z.string().max(600).optional().describe("The step's key result as one mathjs equation"),
  fromStudent: z.boolean().optional().describe("Re-plans only: true for steps restating the student's own lines"),
});
export type PlannerStep = z.infer<typeof PlannerStep>;

export const PlannerOut = z.object({
  method: z.string().min(1).max(300),
  steps: z.array(PlannerStep).min(1).max(16),
  finalAnswer: z.object({ latex: z.string().min(1), value: z.number().optional(), units: z.string().optional() }),
  solution: z
    .array(z.object({ symbol: z.string().min(1), value: z.string().min(1) }))
    .max(20)
    .describe("Every unknown in the givens (mathjs), or as a number in the problem's units"),
});
export type PlannerOut = z.infer<typeof PlannerOut>;

export const SplitOut = z.object({ steps: z.array(PlannerStep).min(2).max(3) });
export type SplitOut = z.infer<typeof SplitOut>;

// ── Check my work ────────────────────────────────────────────────────────────

export const ReadWorkOut = z.object({
  readAs: z.string().max(2000).describe("What the student wrote, transcribed faithfully, math in $...$"),
  lines: z
    .array(
      z.object({
        latex: z.string().max(600),
        mathjs: z.string().max(600).optional().describe("The same line in mathjs syntax using the problem's symbols; omit if it isn't math"),
      }),
    )
    .max(8),
  unreadable: z.boolean(),
});
export type ReadWorkOut = z.infer<typeof ReadWorkOut>;

export const JudgeOut = z.object({
  approach: z.enum(["same_method", "different_method", "unclear"]).describe("For a correct line not in the plan"),
  nearestStep: z.number().int().min(0).optional().describe("The plan step the student's line corresponds to or was attempting"),
  feedback: z.string().max(600).describe("1–2 sentences for the student, following the rules"),
});
export type JudgeOut = z.infer<typeof JudgeOut>;

export const CheckAnswerOut = z.object({
  verdict: z.enum(["right", "partly", "wrong"]),
  feedback: z.string().max(400),
});
export type CheckAnswerOut = z.infer<typeof CheckAnswerOut>;

/** Repairs replace only the flagged steps (by index); everything else is kept as it was. */
/**
 * A field-level fix for one flagged step. Checks are always resent; every other field is sent
 * only if it must change, so good teaching text can't be overwritten by a repair.
 */
export const StepFix = z.object({
  index: z.number().int().min(1),
  checks: PlannerCheck.array().min(1).max(6),
  resultEquation: z.string().max(600).optional(),
  latex: z.string().max(3000).optional().describe("Only if the step's math was wrong"),
  scaffoldLatex: z.string().max(3000).optional(),
  title: z.string().max(80).optional().describe("Only if flagged as a placeholder"),
  rationale: z.string().max(600).optional(),
  hint1: z.string().max(300).optional().describe("Only if flagged"),
  hint2: z.string().max(300).optional().describe("Only if flagged"),
});
export type StepFix = z.infer<typeof StepFix>;

export const RepairOut = z.object({
  fixes: z.array(StepFix).max(16),
  solution: z
    .array(z.object({ symbol: z.string().min(1), value: z.string().min(1) }))
    .max(20)
    .optional()
    .describe("Only if the solution values themselves were wrong"),
});
export type RepairOut = z.infer<typeof RepairOut>;
