# Iteration 2 — Plan

Brief: [`ITERATION-2-PROMPT.md`](ITERATION-2-PROMPT.md) · Audit: [`ITERATION-2-AUDIT.md`](ITERATION-2-AUDIT.md) ·
Decisions log: [`DECISIONS.md`](DECISIONS.md)

## Shape of the change

V0 is "a chat that knows the page". Iteration 2 makes it "a tutor working a problem with you":

```
Course ─┬─ Problems (newest first) ──── Problem ── SolutionPlan (server only)
        │                                    ├──── WhiteboardState (what's revealed)
        │                                    └──── Thread (chat messages for this problem)
        ├─ Sessions (visits; for instrumentation)
        └─ Documents (PDF material)
Profile (one per student): learner model, depth style, step-size preference
```

The session page becomes a **course workspace**: `/course/[id]` with
`Material (drawer) | Whiteboard | Chat`.

## Data model

New types live in `src/lib/board/types.ts` (domain + zod schemas). All LLM-facing schemas are
separate, flatter zod schemas in `src/lib/board/llm-schemas.ts` (providers accept a JSON Schema
subset; unions become a `type` enum with optional fields, then transform to the domain type).

- `Course { id, name, archived, personalize, mode: 'chiron'|'baseline', createdAt, lastOpenedAt }`
- `Visit` (the brief's "session") `{ id, courseId, startedAt, lastActiveAt }` — a new one starts
  when a course is opened after 30 min of inactivity. Every event carries `sessionId` = visit id.
- `Problem` — as in the brief, plus `courseId` (required), `title`, `setup` (Given/Find/Assumptions),
  `planError?`.
- `SolutionStep` — as in the brief, plus:
  - `resultEquation?` — the step's key result as a mathjs equation (`R_B = 3*w*L/8`), used to
    position a student's checked line.
  - `origin: 'plan' | 'student'` — steps rebuilt from a student's alternative method.
  - `verifyStatus: 'verified' | 'failed' | 'conceptual'` and `verifyDetail?` (set by the verifier).
  - Setup (step 0) carries `setup: { given[], find[], assumptions[] }` instead of one latex block.
- `SolutionPlan` — as in the brief, plus `solution: Record<symbol, expr>`: every unknown expressed in
  the givens. This lets the verifier judge *any* student equation (is it consistent with the true
  solution?), not just ones that match a planned step.
- `WhiteboardState` — as in the brief, plus `filledScaffolds: number[]`, `hintsShown` (for the
  upcoming step), `activeCheck` (check-for-understanding), `lastCheckAt`, `completed`.
- `Thread` — chat messages per problem (plus one course-level thread for questions with no problem).
- `Profile` gains `stepSize` (−2…+2, fed to the Planner).

**Projection rule:** the client only ever receives `ClientBoard = project(problem, plan, board)`.
It holds revealed steps only, plus hints already shown for the upcoming step. `SolutionPlan` is
never serialised to a response. A unit test and an end-to-end test assert this.

## Storage

`src/lib/db/` gets a small document-store interface (`get / put / update / list / appendEvent /
putBlob / getBlob`) with the existing file implementation behind it. Moving to Neon Postgres + Vercel
Blob later means writing one adapter (`docs(collection, id, jsonb)` table + blob calls), not touching
callers. `CHIRON_DATA_DIR` makes the data directory configurable (tests use a temp dir). The
migration itself is out of scope (see DECISIONS).

## LLM layer

Replace the chat-shaped `Tutor` with a provider interface `LLM` (`src/lib/llm/`):

- `structured({ tier, system, parts, schema, label })` — JSON-schema structured output, zod-validated,
  one retry with the validation error, then a typed error.
- `toolTurn({ tier, system, parts, respondSchema, … })` — the existing math-tool loop, generalised.
- `text({ tier, system, history, parts })` — baseline.
- Tiers: `strong` (Planner, judge) and `fast` (intake/setup, intent+chat, check questions).
  Env: `LLM_PLANNER_MODEL`, `LLM_CHAT_MODEL` (defaults: `gemini-pro-latest` / `gemini-flash-latest`,
  or `claude-opus-5-5` for both on Anthropic).
- Implementations: `gemini.ts`, `anthropic.ts`, `mock.ts` (deterministic, fixture-driven, for e2e tests).

## Phase 1 — interaction fixes (files)

- `src/lib/db/*` (store interface + file adapter), `src/lib/llm/*` (new LLM layer).
- `src/lib/board/types.ts`, `src/lib/board/intake.ts` — `intakeProblem()`: one fast call (vision when
  there's an image) returns `{ statement, title, setup }`.
- `src/lib/workspace.ts` — course/visit/problem/thread service.
- API: `POST /api/courses`, `GET /api/courses/[id]/workspace`, `POST /api/courses/[id]/messages`
  (composer: normal / new-problem modes), `POST /api/courses/[id]/problems` (text / image / pdf),
  `PATCH /api/problems/[id]` (edit statement), `POST /api/uploads` (images).
- UI: `src/components/workspace/Workspace.tsx`, `chat/ChatPanel.tsx`, `chat/Composer.tsx`
  (fixed, multi-line, image thumbnails, modes), `board/ProblemCard.tsx`, `board/Whiteboard.tsx`
  (placeholder: setup only), material drawer reusing `MaterialPane`.
- `/demo` creates a demo course and submits Problem 7.18 as a PDF-sourced problem.
- Tests: Vitest set up; unit tests for intake parsing and the projection.

## Phase 2 — whiteboard (files)

- `src/lib/board/verify.ts` (+ `verify.test.ts`) — numeric (with units), equivalence (≥5 valid random
  points, retry singular points), equation-consistency, parse errors as failures. Adds `nint()` and
  `diff()` helpers to mathjs scope so integrals and ODE solutions can be checked independently.
- `src/lib/board/planner.ts` — `planSolution()`, `repairPlan()`, `splitStep()`, `replanFromStudent()`.
- `src/lib/board/reveal.ts` — pure state transitions: next, hint, got-it, resume, activate, fill
  scaffold, check-question scheduling; and `project()` to the client view.
- `src/lib/board/intent.ts` (+ test) — rules first (buttons-as-words, "step 2"), then one combined
  fast call that returns intent + reply.
- `src/lib/board/checkwork.ts` — extract → verifier match against step `resultEquation`s and the
  plan's `solution` → verdict; LLM only names the error / spots alternative methods.
- `src/lib/board/chat.ts` + prompts — context packet per 2.7, memory-phrase post-check.
- API: `POST /api/problems/[id]/plan` (client-triggered, idempotent, long-running),
  `POST /api/problems/[id]/actions` (hint, next, got_it, resume, activate, fill, too_big, too_small,
  dismiss_check, answer_check).
- UI: `board/StepView`, `board/HintNote`, `board/BoardControls`, `board/StudentLine`,
  `board/CheckQuestion`, keyboard shortcuts.
- `fixtures/problems/*.json` (6 problems with known answers and reference plans for the mock),
  `scripts/eval-planner.ts` → `docs/PLANNER-EVAL.md`.
- Playwright: `e2e/whiteboard.spec.ts` (mock LLM, temp data dir), network-leak assertion.

## Phase 3 — courses & quiet memory (files)

- Home becomes the course list (`components/course/CourseHome.tsx`): create, rename, archive.
- Course page: problem history with status, resume most recent in-progress problem.
- `src/lib/board/memory.ts` — evidence-only learner updates; `memory-phrases.ts` (+ test).
- `components/course/AssumesPanel.tsx` (collapsed), per-course Personalize toggle.
- Topics covered derived from concept tags of revealed/checked steps.

## Phase 4 — instrumentation

- `src/lib/events.ts` rewritten around `{ sessionId, courseId, problemId }` context and the brief's
  event names; `summarizeProblem()` / `aggregate()`.
- `/internal/summary` (server component) protected by `INTERNAL_PASSWORD` (cookie set by a small form).

## What happens to V0 features

Retired, with reasons recorded in DECISIONS: the margin-note chat with Too much / Just right /
Too little (replaced by Too big / Too small + Explain more), the state strip (replaced by the
whiteboard and the collapsed assumes panel), the two-screen onboarding (replaced by courses + an
optional profile), `/research` and per-session summary pages (replaced by `/internal/summary`).
Kept: material viewer, PDF page images, problem marking, KaTeX, math tools, demo chapter,
baseline mode (as a per-course flag), learner-model rules, Gemini + Anthropic providers.

## Risks

1. **Planner accuracy and verifiability.** Checks are only as good as the specs the Planner writes;
   a wrong step with a self-consistent wrong check would pass. Mitigation: `solution` values are
   checked against the *original* equations, final answers are checked against fixtures, and the
   eval doc records failures.
2. **Latency.** A strong-model plan can take 20–60 s. Mitigation: the setup comes from a fast call
   and is shown at once; the plan runs in its own request while the student reads the setup.
3. **Vercel.** Local storage, request-size limits and long-running plan requests (needs
   `maxDuration`). Documented for the deploy; not migrated here.
4. **Equation matching.** Students write equivalent equations in many forms (scaled, rearranged).
   The consistency check (substitute the true solution) handles most; when it can't decide, Chiron
   says it can't verify rather than guessing.
5. **Scope.** Four phases of UI and server work. The order keeps the app running throughout; the
   mock LLM keeps end-to-end tests deterministic.
