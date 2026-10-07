import { z } from "zod";

// The model ends every Chiron turn by calling `respond` with this payload.

export const RespondSchema = z.object({
  response: z.string().min(1),
  explanationDepth: z.number().int().min(1).max(4),
  sources: z
    .array(z.object({ type: z.enum(["material", "inference", "general"]), ref: z.string() }))
    .max(6),
  containsCalculation: z.boolean(),
  calculationsVerified: z.boolean(),
  studentClaim: z
    .object({
      claim: z.string(),
      verdict: z.enum(["correct", "incorrect", "partly_correct", "unverifiable"]),
    })
    .nullable(),
  detectedConcepts: z.array(z.string()).max(6),
  knowledgeUpdates: z
    .array(
      z.object({
        concept: z.string(),
        state: z.enum(["known", "learning", "uncertain"]),
        evidence: z.string(),
      }),
    )
    .max(4),
  taskUpdate: z
    .object({
      currentStep: z.string().nullable(),
      task: z.string().nullable(),
    })
    .nullable(),
  sideQuestion: z.enum(["open", "close", "none"]),
});

export type RespondPayload = z.infer<typeof RespondSchema>;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

export const RESPOND_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    response: {
      type: "string",
      description:
        "What the student sees. Markdown; inline math in $...$, display math with $$ on its own line before and after. Usually 1–3 sentences.",
    },
    explanationDepth: { type: "integer", enum: [1, 2, 3, 4], description: "Depth level you actually answered at." },
    sources: {
      type: "array",
      description:
        "Where each claim comes from. material = the student's material (ref like 'p. 342, Eq. 7.12'); inference = your reasoning from it; general = general knowledge not in the material.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["material", "inference", "general"] },
          ref: { type: "string" },
        },
        required: ["type", "ref"],
      },
    },
    containsCalculation: {
      type: "boolean",
      description: "True if the response states any numeric result, algebraic step, or derived expression.",
    },
    calculationsVerified: {
      type: "boolean",
      description: "True only if every calculation in the response was checked with a math tool this turn.",
    },
    studentClaim: nullable({
      type: "object",
      description: "If the student asserted a step, value or answer, your checked verdict on it.",
      properties: {
        claim: { type: "string" },
        verdict: { type: "string", enum: ["correct", "incorrect", "partly_correct", "unverifiable"] },
      },
      required: ["claim", "verdict"],
    }),
    detectedConcepts: {
      type: "array",
      items: { type: "string" },
      description: "Concepts this turn touched, lowercase, reusing learner-model names where they match.",
    },
    knowledgeUpdates: {
      type: "array",
      description: "Only with real evidence from this turn. Leave empty when unsure.",
      items: {
        type: "object",
        properties: {
          concept: { type: "string" },
          state: { type: "string", enum: ["known", "learning", "uncertain"] },
          evidence: { type: "string" },
        },
        required: ["concept", "state", "evidence"],
      },
    },
    taskUpdate: nullable({
      type: "object",
      description: "Set when the student has moved to a new step (or a new problem). Short phrases.",
      properties: {
        currentStep: { type: ["string", "null"] },
        task: { type: ["string", "null"] },
      },
      required: ["currentStep", "task"],
    }),
    sideQuestion: {
      type: "string",
      enum: ["open", "close", "none"],
      description:
        "open = this message is a tangent away from the current step; close = a side question was open and the student is done with it; none = otherwise.",
    },
  },
  required: [
    "response",
    "explanationDepth",
    "sources",
    "containsCalculation",
    "calculationsVerified",
    "studentClaim",
    "detectedConcepts",
    "knowledgeUpdates",
    "taskUpdate",
    "sideQuestion",
  ],
};
