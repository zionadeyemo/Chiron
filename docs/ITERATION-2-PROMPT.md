# CHIRON — Iteration 2: Whiteboard Tutoring

> Saved verbatim from the iteration brief (2026-10-08). Plan: [`ITERATION-2-PLAN.md`](ITERATION-2-PLAN.md).
> Decisions: [`DECISIONS.md`](DECISIONS.md).

You are continuing work on CHIRON, an existing Next.js + TypeScript + Tailwind study-tutor prototype. This iteration turns CHIRON from a chat tool into a step-by-step tutor with a shared whiteboard. It is based on first real user testing.

Work through the phases below in order. Each phase ends with a running app, passing tests and a short report to me. Do not start a phase until the previous one meets its acceptance criteria. Make reasonable decisions without stopping to ask me, but record every significant decision in `docs/DECISIONS.md`.

## 0. Context: why we're doing this

Survey data (49 students) and my own testing show:

* Students want paced help. 83% want step-by-step or adaptive help; only 17% want the full answer up front. "Knows when to explain more vs. less" is AI's lowest-rated skill (2.5/5).
* Accuracy is a top priority. Students also complain that AI agrees with them when they're wrong.
* Starting is the real bottleneck. In testing, I pasted a problem and then just sat there staring at it. CHIRON waited for me to ask something. A real tutor would have started.
* Memory should be quiet. Referencing what CHIRON knows about me ("Remember when you learned…") gets old fast. Memory should shape explanations without announcing itself.
* Basic input is broken. There's no obvious general chat bar, no way to paste a text problem, and no clear way to start a new problem.

The core idea of this iteration: The whiteboard is the working surface: CHIRON writes one step, then stops. The chat is the conversation: the student asks about the step, and CHIRON answers without advancing. The student controls progression with Hint, Next step and I got it.

Guiding principle: the goal is not to write as many steps as possible. It is to give the minimum help needed before the student can continue on their own.

## Phase 0 — Audit and plan (no feature code yet)

1. Read the entire codebase. Read `docs/SPEC.md`, `CLAUDE.md` and any existing docs.
2. Write `docs/ITERATION-2-AUDIT.md` covering:
   * Current file/folder structure and what each major module does
   * How the LLM provider abstraction works and where prompts live
   * How sessions, messages, learner model and instrumentation are stored, and whether storage works on Vercel (local files and SQLite do NOT persist on Vercel serverless)
   * How problems and materials currently enter a session (PDF, screenshot, text)
   * Every UI component involved in the Study Session screen
   * Existing tests and how to run them
   * Bugs or dead ends you notice (buttons that do nothing, states that hang)
3. Write `docs/ITERATION-2-PLAN.md`: the concrete files you'll add or change per phase, the data model changes, and the risks.
4. Update `CLAUDE.md` to point to this prompt (save it as `docs/ITERATION-2-PROMPT.md`) and the plan.
5. Confirm the app currently builds and runs. Fix anything that's broken before continuing.

Report to me: a 10-line summary of the audit and anything that changes the plan below.

## Phase 1 — Fix the immediate interaction problems (P0)

### 1.1 Persistent composer (chat input)

* One always-visible input fixed at the bottom of the CHIRON panel. It must never scroll out of view or be covered by the whiteboard.
* Multi-line textarea. Enter sends, Shift+Enter adds a newline. Placeholder: `Ask anything, or paste a problem…`
* Accepts typed text, pasted text and pasted images (Ctrl/Cmd+V). Show pasted images as a small removable thumbnail above the input before sending.
* Works with or without any uploaded material. A student with no PDF can type a plain question and get an answer.
* After every response the input stays focused and ready. Sending never resets the session.
* Disable sending only while a request is in flight. Show a subtle working indicator, not a spinner overlay.

### 1.2 New problem vs. question

* Add an explicit + New problem button in the CHIRON panel header.
  * Clicking it opens the composer in "new problem" mode (label changes to `Paste or type the problem…`).
  * Submitting in this mode creates a new Problem within the same session. The previous problem and its whiteboard are kept in the session history and can be reopened.
* In normal mode, everything typed is treated as a message in the current problem's context. Never reset the conversation automatically.
* Safety net: if a normal-mode message looks like a full new problem statement (the intent classifier in 2.6 decides), show a small inline chip: `Start this as a new problem?` [Yes] [No, it's a question]. Never switch automatically.
* If there is no active problem yet, the first problem-like submission becomes the problem automatically.

### 1.3 Problem intake

Support three ways to supply a problem, all ending in the same `Problem` record:

1. Text: pasted or typed problem statement.
2. Image: a pasted screenshot or uploaded image. Send it to a vision-capable model to extract the statement. Store both the image and the extracted text.
3. PDF: keep the existing flow. The student marks the current page/problem; send the page image plus extracted text.

For images and PDFs, show the extracted problem statement back to the student in a collapsible "Problem" card at the top of the whiteboard so they can confirm CHIRON read it correctly. Add a small Edit action to fix misreads (a corrected statement triggers re-planning in Phase 2).

### 1.4 Automatic first intervention

When a problem is submitted, or a session starts with a seeded or uploaded problem, CHIRON must act immediately. It must never sit idle waiting for the student.

The first intervention is always a setup step, not part of the solution:

```
GIVEN:  (known quantities, with units and symbols from the problem)
FIND:   (what's being asked)
(optional) ASSUMPTIONS / DIAGRAM NOTES: only if stated or clearly standard
```

Then CHIRON adds one short line in chat, e.g. `Here's the setup. Want a hint for where to start, or the first step?` and stops.

* No introductions ("Great question!", "I'd be happy to help…").
* No solving beyond the setup.
* When the student resumes a previous session or problem, restore the whiteboard and active step exactly. Add at most one short line ("Picking up at step 3."), or nothing.

In Phase 1 (before the full whiteboard exists), render the setup step in a simple whiteboard placeholder area so this behavior works end to end.

### 1.5 Phase 1 acceptance criteria

* [ ] I can type a plain question with no material uploaded and get a short answer.
* [ ] I can paste a text problem and immediately see a Given/Find setup without asking anything.
* [ ] I can paste a screenshot problem and get the same.
* [ ] I can ask a follow-up after every response; the input is always visible.
* [ ] + New problem starts a new problem without losing the old one.
* [ ] Nothing in the UI is a dead button.
* [ ] Typecheck, lint, build and all tests pass.

Report to me, then continue.

## Phase 2 — Shared whiteboard (P1)

This is the heart of the iteration. Build it carefully.

### 2.1 Architecture: plan first, reveal gradually

When a problem is submitted, CHIRON solves the whole problem privately first, verifies it, stores it on the server, and reveals it one step at a time.

```
Problem submitted
  → Planner (strong model): full solution as structured steps
  → Verifier: checks every step's math with code
  → if failures: Planner repairs flagged steps (max 2 repair rounds)
  → store SolutionPlan server-side (status: verified | unverified)
  → reveal Step 0 (setup) to the client
  → each "Next step" reveals exactly one more step
```

Critical security/pedagogy rule: unrevealed steps never leave the server. API responses to the client contain only revealed steps. Students should not be able to read the solution in the network tab.

Latency: the setup step should appear fast. Generate it with a quick call (or the first part of the plan) and show a quiet `Working through the problem…` state on the whiteboard until the plan is ready. Next step and Hint are disabled until the plan exists.

### 2.2 Data model

Add or adapt these types (use zod schemas for everything crossing the LLM or API boundary):

```ts
type Problem = {
  id: string; sessionId: string; courseId?: string;
  source: 'text' | 'image' | 'pdf';
  statement: string;            // confirmed/extracted text
  imageRef?: string; pdfRef?: { docId: string; page: number };
  createdAt: string;
  status: 'planning' | 'ready' | 'failed';
};

type SolutionStep = {
  index: number;                // 0 = setup
  kind: 'setup' | 'equation' | 'substitution' | 'algebra' | 'concept' | 'scaffold' | 'result';
  title: string;                // short label, e.g. "Sum moments about A"
  latex: string;                // what gets written on the board
  scaffoldLatex?: string;       // for 'scaffold': partially filled version, e.g. matrix with blanks
  rationale: string;            // 1–2 sentences: why this step (used for "why?" answers)
  hints: [string, string];      // hint 1 = gentle nudge, hint 2 = stronger nudge; neither states the result
  checkQuestion?: string;       // optional check-for-understanding question
  verification: VerificationSpec[];
  concepts: string[];           // concept tags for the learner model
};

type VerificationSpec =
  | { type: 'numeric'; expr: string; expected: number; tolerance?: number; units?: string }
  | { type: 'equivalence'; lhs: string; rhs: string; variables: string[] } // symbolic equality via random-point testing
  | { type: 'none'; reason: string };                                       // purely conceptual step

type SolutionPlan = {
  problemId: string;
  method: string;               // one-line description of the approach
  steps: SolutionStep[];
  finalAnswer: { latex: string; value?: number; units?: string };
  status: 'verified' | 'partially_verified' | 'unverified';
  failedChecks: { stepIndex: number; detail: string }[];
  version: number;              // increments on re-plan
};

type WhiteboardState = {
  problemId: string;
  planVersion: number;
  revealedCount: number;        // steps 0..revealedCount-1 are visible
  activeStepIndex: number;      // the step chat questions default to
  studentMode: 'guided' | 'independent'; // independent after "I got it"
  hintLevelForNextStep: 0 | 1 | 2;
  studentLines: StudentLine[];  // work the student submitted for checking
};

type StudentLine = {
  id: string; latexOrText: string; imageRef?: string;
  verdict?: 'correct' | 'incorrect' | 'different_method' | 'unclear';
  feedback?: string; createdAt: string;
};
```

Persist all of this in the existing store. If the store is local files or SQLite, note in `DECISIONS.md` that it must move to a hosted database (e.g. Neon Postgres) before Vercel deployment. Do not do that migration in this iteration unless it's trivial.

### 2.3 The Planner

A server-side function `planSolution(problem, learnerContext)`:

* Uses the strongest available model, with vision if the problem has an image.
* Returns a `SolutionPlan` via structured output (tool use or JSON schema) validated with zod. Retry once on invalid output.
* Planner prompt rules:
  * Use the problem's own notation, symbols, units and sign conventions.
  * One meaningful step per entry. A step is one idea a student would write as one line or a short block: not "solve the whole system", not "add 2 to both sides".
  * Calibrate step size to the learner: skip trivial algebra for students strong in algebra; split steps on concepts marked uncertain.
  * For matrix, table or long-expression steps, use `kind: 'scaffold'` with a `scaffoldLatex` that shows the structure (e.g. the matrix layout with the first row filled in) so the student can take over.
  * Every step that contains math must include at least one `VerificationSpec`. Use `{type:'none'}` only for genuinely conceptual steps, with a reason.
  * Hints must never state the step's result. Hint 1 points at the idea ("What has to be true about the moments at a fixed support?"); hint 2 names the tool ("Sum moments about A; the reaction at A drops out.").
  * Include a `checkQuestion` on at most one in three steps, only where it tests understanding, not arithmetic.

### 2.4 The Verifier

A server-side module `verifyPlan(plan)` with unit tests.

* Use `mathjs` (or an equivalent JS library that runs on Vercel) for evaluation.
* `numeric`: evaluate `expr` and compare to `expected` within `tolerance` (default relative 1e-6, absolute 1e-9). Handle units if mathjs units are used; otherwise compare magnitudes.
* `equivalence`: test symbolic equality by evaluating `lhs - rhs` at 5+ random points for the listed variables (avoid zeros and singularities; retry points that throw). Pass if all are within tolerance. This catches algebra errors without a full CAS.
* Parse failures are not silent passes. Record them as failed checks.
* On failures: send the flagged steps and failure details back to the Planner for repair (max 2 rounds). If still failing, set `status: 'partially_verified'` or `'unverified'`.
* The UI must show this honestly. Steps that failed verification get a subtle marker ("couldn't verify this step"), and CHIRON says so in one line when revealing them. Never present unverified math as certain.

Write unit tests covering: correct numeric, wrong numeric, correct algebraic identity, subtle algebra error (sign flip, missing factor), parse error, singular points.

### 2.5 Whiteboard UI

A dedicated whiteboard column, the visual center of the Study Session:

* Layout: Material | Whiteboard | CHIRON chat. If space is tight, Material collapses to a toggleable drawer; the whiteboard and chat stay visible. Desktop first, minimum 1280px wide.
* Visual style: matches the existing quiet, academic, paper-like design. It should feel like a clean notebook page, not a chat log. Steps are numbered in the margin; each has a small muted title and the math rendered with KaTeX (display mode).
* The problem card (collapsible) sits at the top, then the steps in order.
* The active step has a subtle highlight (e.g. a thin accent rule in the margin). Clicking any revealed step makes it active, so chat questions then refer to it.
* New steps appear with a short, calm reveal (fade or a quick top-to-bottom wipe, under 400ms). No typewriter effect.
* `scaffold` steps render `scaffoldLatex` with visibly empty slots, plus a small `Fill in the rest` action that reveals the full `latex`.
* Student-submitted lines (2.8) appear inline in a distinct "student hand" style (different color or font) so it's clear who wrote what.
* Controls pinned at the bottom of the whiteboard:
  * Hint: shows the next hint for the upcoming step, not the step itself. First press shows hint 1, second press shows hint 2. A third press offers Next step.
  * Next step: reveals exactly one step.
  * I got it: switches to independent mode. CHIRON stops offering steps, the controls collapse to Check my work and Resume guidance.
  * Check my work (always available): opens the composer in "my work" mode (2.8).
* Hints appear as a small margin note beside the upcoming step's position on the whiteboard, not as a chat message.
* Keyboard shortcuts: `H` hint, `N` next step, `G` I got it (only when the composer isn't focused).

### 2.6 Chat routing and intent

Every chat message goes through a lightweight intent step (a small, fast model call with structured output, or a combined call) that returns one of:

```
question_about_step | ask_next_step | ask_hint | student_work | new_problem | general_question | other
```

Routing:

* `question_about_step` → answer about the active step (or the step they reference, e.g. "step 2"). Never advance the whiteboard.
* `ask_next_step` / `ask_hint` → same as pressing the button; reply in chat with one short line at most.
* `student_work` → treat as Check my work (2.8).
* `new_problem` → show the "Start this as a new problem?" chip (1.2).
* `general_question` → answer briefly with normal right-sized rules; keep the whiteboard state untouched; offer to return ("Back to step 3?") only if natural.

### 2.7 The chat tutor's context packet

For chat answers, construct a packet. Do not send full chat history:

```
LEARNER: profile, depth preference, relevant known/uncertain concepts (only those tagged on revealed or active steps)
PROBLEM: statement
WHITEBOARD: revealed steps (index, title, latex, rationale), active step index, mode
RECENT CHAT: last 6 turns
STUDENT LINES: last 3, with verdicts
```

The chat model does not receive unrevealed steps. It can't leak what it doesn't have. If it needs to hint, it uses the hint system.

Chat response rules (add to the system prompt):

* Answer about the active step unless the student says otherwise.
* 1–3 sentences by default. "Explain more" goes one level deeper.
* Do not write the next step in chat. If the student wants it, they press Next step or ask for it.
* If the student states something incorrect, say so plainly and point at where it goes wrong. Never "yes, that's right, but…" when it isn't.
* Cite the problem or material when using it.
* Use learner memory silently: adjust depth and vocabulary, but don't announce what you remember ("As you learned in…", "Since you know…") unless it's genuinely needed to connect ideas, and then at most once per problem.

### 2.8 Check my work (getting back in after "I got it")

The student submits their current line or work as text, LaTeX or a pasted photo of handwritten work.

* Extract the expression(s) (vision model for photos; show what was read so the student can correct a misread).
* Compare against the plan:
  * Use the verifier: does their line equal (equivalence or numeric) any step's result or a valid intermediate?
  * correct → "Correct." plus, if useful, where it sits in the solution. Set `activeStepIndex` to the matching step; mark revealed up to it if the student is ahead.
  * incorrect → name the specific error in one or two sentences (sign, missing term, wrong moment arm). Don't give the corrected line unless asked; offer Hint.
  * different_method → the student used a valid alternative approach. Re-plan from their method (Planner gets the student's work as a fixed prefix), increment `planVersion`, keep their lines on the board, continue from there.
  * unclear → ask one short clarifying question.
* Never confirm a line as correct unless the verifier agrees. If verification isn't possible, say "I can't verify this one with certainty" and explain your reasoning.

### 2.9 Step-size feedback (replaces "Too much / Just right / Too little")

On each revealed step, show two tiny, muted controls on hover: Too big / Too small.

* Too big → the Planner splits that step into 2–3 substeps (re-verified), replacing it on the board.
* Too small → note it; on the next re-plan or new problem, increase step granularity. Optionally merge the next two unrevealed steps.
* Store a per-student step-size preference that feeds the Planner.

Keep Explain more in chat for depth of explanation (separate from step size).

### 2.10 Check-for-understanding questions

* After revealing a step with a `checkQuestion`, show it as a quiet, dismissible prompt under the step ("Quick check: why does the reaction at A drop out?").
* Never block progression. Next step still works without answering.
* At most one active check question at a time, and no more often than every 3 steps.
* If the student answers, evaluate briefly ("Exactly." / one-sentence correction).

### 2.11 Phase 2 acceptance criteria

Build and test with a fixture set of at least 6 problems in `fixtures/problems/` (write them yourself; include known final answers):

1. Statically determinate beam reactions
2. Statically indeterminate (propped cantilever) using compatibility
3. 2×2 or 3×3 linear system / matrix problem (tests scaffold steps)
4. A definite integral
5. A first-order ODE
6. A conceptual question with little math

Then:

* [ ] Each fixture produces a plan; record verification status per fixture in `docs/PLANNER-EVAL.md`. All final answers must match the known answers. Investigate and fix any that don't.
* [ ] Unrevealed steps are absent from all client network responses (write a test that asserts this).
* [ ] Next step reveals exactly one step. Hint never reveals the step's result (spot-check all fixtures and record in the eval doc).
* [ ] Asking "why?" about step 2 answers about step 2 and does not change `revealedCount`.
* [ ] Clicking step 1 then asking a question answers about step 1.
* [ ] I got it → Check my work with a correct line → marked correct and positioned in the solution.
* [ ] Check my work with a deliberately wrong line (sign error) → error identified, not corrected outright.
* [ ] A valid alternative method triggers a re-plan that continues from my work.
* [ ] Too big splits a step into verified substeps.
* [ ] A step that fails verification is visibly marked and CHIRON says so.
* [ ] Unit tests for the verifier and the intent router pass. Add Playwright end-to-end tests for: paste text problem → setup appears → hint → next step → question about step → I got it → check work.
* [ ] Typecheck, lint, build and all tests pass.

Report to me with the eval results, then continue.

## Phase 3 — Courses and quiet memory (P2)

### 3.1 Course workspaces

* A simple home screen listing the student's courses (e.g. "AERO 304 — Structural Analysis"). Create, rename or archive a course. No other dashboard elements.
* Each course contains its sessions and problems, newest first, with status (in progress, solved, independent).
* Opening a course resumes the most recent in-progress problem with its whiteboard exactly as left. Previous problems are one click away.
* Each course keeps its own topics-covered list, derived from the concept tags of revealed and checked steps.

### 3.2 Quiet memory

* Learner model updates conservatively and only from evidence: Check my work verdicts, hint usage, I got it timing, Too big/Too small, explicit corrections. Not from the model guessing.
* Memory affects the Planner (step size, which steps to split or skip) and chat depth. It is not mentioned to the student by default.
* Add a system-prompt rule and a test: responses must not contain memory-announcing phrases ("as you learned", "remember when", "since you already know", "based on your profile") unless the student asked about their history. Implement as a post-check that regenerates once if violated.
* A small "What CHIRON assumes" panel per course (collapsed by default) lets the student view and edit concept states.
* A per-course toggle: Personalize explanations on/off. Off means the Planner and chat use only the course and problem, no learner model.

### 3.3 Phase 3 acceptance criteria

* [ ] I can create two courses, work a problem in each, leave, come back, and land exactly where I was in each.
* [ ] Topics covered update after solving problems.
* [ ] A full guided problem produces no memory-announcing phrases (test it).
* [ ] Turning personalization off visibly changes nothing in tone but removes learner context from the requests (verify in logs).
* [ ] Typecheck, lint, build and all tests pass.

Report to me, then continue.

## Phase 4 — Instrumentation for validation

Log these events (local or DB, no third-party analytics), each with `sessionId`, `problemId`, `courseId`, timestamp:

* `problem_submitted` (source)
* `setup_shown` (latency ms)
* `plan_ready` (latency ms, step count, verification status)
* `hint_shown` (level, step index)
* `next_step` (step index)
* `step_question` (step index)
* `explain_more`
* `i_got_it` (steps revealed at that moment: this is the key metric)
* `check_work` (verdict)
* `replan` (reason: alternative method, too big, edit)
* `step_size_feedback` (too big / too small)
* `check_question_answered` / `check_question_dismissed`
* `problem_completed` (by student / by full reveal)

Add an internal page `/internal/summary` (protected by the existing access code or an env-var password) showing per-session and aggregate stats:

```
Problem: Propped cantilever (AERO 304)
Steps in plan: 7 · Revealed before "I got it": 2 · Hints used: 3 (2 before step 1)
Questions about steps: 4 · Check my work: 3 (2 correct, 1 sign error caught)
Plan verification: verified · Time to setup: 1.8s · Time to plan: 9.4s
```

Aggregate view: median steps revealed before "I got it", hint-to-next-step ratio, % plans fully verified, % problems completed by the student vs. full reveal.

## Global rules for all phases

Do:

* Keep the LLM provider behind the existing single server-side interface. Planner and chat may use different models; make both configurable via env vars.
* Validate every LLM output with zod. Handle failures with a retry, then a graceful message, never a hung UI.
* Keep keys server-side only.
* Match the existing visual language. Keep it quiet, precise and academic.
* After each phase: run the app, walk through the acceptance criteria yourself, fix what fails, and update `docs/DECISIONS.md` and `CLAUDE.md`.
* Write the tests listed. Don't mark a phase done with failing tests.

Don't:

* Don't auto-interrupt the student based on inactivity or timers.
* Don't reveal more than one step per action.
* Don't put unrevealed steps in client responses or in the chat model's context.
* Don't present unverified math as certain.
* Don't build handwriting, drawing canvases, voice, mobile layouts, quizzes, flashcards, gamification, auth/signup, payments or professor features.
* Don't add introductory filler messages.
* Don't remove existing working features without noting why in `DECISIONS.md`.

## When finished

1. Run typecheck, lint, unit tests, end-to-end tests and a production build.
2. Give me exact commands to run it locally and any new env vars.
3. Tell me what must change before deploying to Vercel (storage, env vars, access protection).
4. Give me a 5-minute demo script that shows: paste → setup → hint → next step → question about a step → I got it → wrong line caught → correct line → resume.
5. Summarize `docs/PLANNER-EVAL.md`: accuracy across fixtures and the failure cases.
6. List the three biggest remaining risks and how the Phase 4 metrics will test them.

Begin with Phase 0.
