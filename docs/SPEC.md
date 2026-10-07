# CHIRON — Product & Build Specification (V0 prototype)

> Source of truth for the prototype. Saved verbatim from the founding brief (2026-10-06).
> Implementation decisions live in `docs/PLAN.md`.

You are my founding engineer. We are building the first real prototype of CHIRON.
Do not build a generic AI chatbot.

---

## WHAT WE KNOW (from 49 student survey responses)

This matters for every trade-off you make. Optimize for what students actually said, not for what sounds impressive.

### STRONG SIGNAL: explanation fit

* 83% want help paced to where they are (step-by-step or adaptive). Only 17% want the full answer up front.
* "Knows when to explain more vs. keep it brief" was AI's lowest-rated skill (2.5 / 5).
* ~60% say AI often over-explains or explains things they already know.
* Top requested fix: "understand what I'm specifically confused about."

### STRONG SIGNAL: accuracy

* Tied for the #1 single improvement students want.
* A top written complaint: hallucinations, wrong methods, answers that don't match the course.
* Students also say AI agrees with them when they're wrong ("yes, that's right but…").

### WEAK SIGNAL: context, memory, continuity

* ~70% often upload or screenshot material, but "see my screen / remember what I know" ranked LAST as priorities.
* 76% just re-explain and keep going when AI loses context. It's tolerated friction.
* Losing track after side questions was the least frequent problem.

Therefore: context and memory are ENABLERS of the right-sized, correct explanation. They are not the product. Do not spend most of the build on document plumbing.

---

## THE PRODUCT

CHIRON is a study companion for college STEM coursework built around one idea:

**Help should be the right size, aimed at exactly what the student is confused about, and correct.**

The normal loop today:

student is stuck → asks AI → gets a long, generic answer that re-explains things they know → parses it, sometimes finds it's wrong → re-explains themselves and tries again

CHIRON should move toward:

student is stuck → asks a tiny question → gets the smallest correct intervention that lets them continue → asks for more only if they need it

The long-term vision is a tutor that stays alongside someone while they learn anything. This prototype is ONLY for one college STEM problem-solving session. Do not attempt the long-term vision.

We are testing whether the interaction feels fundamentally better than ChatGPT for homework.

---

## THE EXPERIENCE TO BUILD

Desktop-first web app. A student starts a Study Session on some course material and works through a problem.

The main screen has three areas:

1. **MATERIAL** — The current problem and its surrounding material. The student can navigate pages and mark which problem they're on. CHIRON always knows this location.
2. **CHIRON** — Not a giant chat window. A quiet tutor beside the student. Responses are normally one to three sentences.

   Example:
   - Student: "why can we assume that?" CHIRON: "Because the beam is in pure bending here, so shear force is zero."
   - Student: "wait remind me what pure bending means" CHIRON: "Constant bending moment, zero shear."
   - Student: "got it" CHIRON: "So back to 7.18: with V = 0, what does that tell you about dM/dx?"

   Every CHIRON response has two one-tap controls:
   * Depth feedback: [Too much] [Just right] [Too little]
   * [Explain more]

   These are the core of the product and the core of the research. They must be fast, unobtrusive and always present.

3. **SESSION STATE** (a quiet strip or margin, not a dashboard)

   CURRENT TASK: Problem 7.18 — Hyperstatic Beam
   CURRENT STEP: Solving compatibility equation
   ASSUMING YOU KNOW: static equilibrium, shear/moment diagrams, Euler-Bernoulli bending
   MIGHT NEED REFRESHING: compatibility conditions

   The student can click any item to correct it. The point is that they can see WHY CHIRON explained something at a particular depth, and fix it in one click.

---

## THE BEHAVIORS WE ARE TESTING (in priority order)

### 1. RIGHT-SIZED HELP (most important)

Default: give the minimum information needed for the student to continue. Then stop.

Bad: 700 words of beam theory because the student asked why M(x) is negative.
Good: "Sign convention: that load bends the cut clockwise, which we've defined as negative."

Progressive depth:
- Level 1 — hint or direct clarification
- Level 2 — short explanation
- Level 3 — worked reasoning
- Level 4 — deep conceptual explanation

Default to Level 1 or 2. "Explain more" goes up exactly one level.

The depth feedback buttons must change future behavior within the session:
* Repeated "Too much" → lower the default level and shorten responses.
* Repeated "Too little" → raise it.
* Store a per-student default depth preference. Some students (about 1 in 6 in our data) genuinely want the full explanation first; respect that if they say so or keep pressing "Too little".

Aim at the confusion, not the topic. If the student asks "where did L^3 come from?", explain that step, not beam deflection in general.

### 2. ACCURACY AND HONESTY

A tutor that is wrong is worse than no tutor. This is non-negotiable.

* Any numeric or algebraic step CHIRON states must be checked with code, not done "in its head". Provide the model a server-side math tool (for example mathjs or a small symbolic library in Node, or a Python sandbox if simpler) and require its use for calculations.
* When a claim comes from the student's material, cite it ("p. 342, Eq. 7.12"). Distinguish material, inference and general knowledge.
* If unsure, say so in one short line.
* Do not agree with the student when they're wrong. When the student states a step or answer, check it. If it's wrong, say so plainly and point at where it goes wrong. Never "yes, that's right, but…" when it isn't right.
* Use the notation and sign conventions of the student's material, not the model's defaults.

### 3. CONTEXT (as an enabler)

CHIRON knows what the student is looking at. If they are on Problem 7.18 and ask "where did that L^3 come from?", it reasons from 7.18 without being told.

Every model request automatically includes the current problem and page.

Engineering material is full of equations and diagrams that text extraction mangles. So:
* Render PDF pages to images and send the current page image to a vision-capable model. Use extracted text only as a supplement.
* Also support the fastest path: the student pastes a screenshot of a problem (Ctrl+V) and it becomes the current task. This is what students already do; make it one keystroke instead of a context switch.

### 4. LEARNER MODEL

A simple persistent profile of concepts with states: KNOWN, LEARNING, UNCERTAIN.

```json
{ "static equilibrium": "known", "moment diagrams": "known", "compatibility equations": "uncertain" }
```

No ML. A small structured store is enough.

CHIRON uses this to decide depth: don't explain algebra to someone who knows algebra; reference what they've shown they know ("same transformation idea you used in Linear Algebra").

Update it conservatively. Depth feedback and explicit corrections are stronger evidence than the model's guesses. The student can view and edit it at any time.

### 5. PEDAGOGY

CHIRON's goal is to increase the student's ability to do the task, not to produce answers.

Before solving something, prefer: hint → targeted question → next step → explanation → full solution only when requested.

Do not Socratic-method the student to death. A tiny factual question gets a tiny factual answer.

### 6. CONTINUITY (keep lightweight)

CHIRON survives a tangent and returns to the task ("Right, so for 7.18…"). Implement with a simple main-task plus one side-question slot. Do not build an elaborate stack; our data says this is a lower-priority pain.

---

## STUDENT PROFILE

Keep onboarding to two short screens.

Screen 1: "What are you working on?" Upload a PDF or paste a screenshot.

Screen 2: "Tell Chiron enough to teach you well."
* Major, year, current course
* Previous relevant courses
* Optional: what you're comfortable with, and "I usually want: short hints / step-by-step / full explanations"

Then START SESSION.

Use this profile in every prompt so CHIRON acts like a specialist in the current course who knows the student's background.

---

## THE UI

Not a generic AI SaaS dashboard. No gradient hero, glowing orb, card soup, chat bubbles everywhere, purple neon, or "Ask me anything!"

Quiet. Academic. Editorial. Precise. Warm. Like an excellent textbook crossed with a beautifully designed IDE: paper, margin annotations, technical notebook, calm typography. Render math properly (KaTeX).

Desktop first. The Study Session is the hero. Make it feel like something a student could study inside for three hours.

Suggested layout (improve it if you have something better):

```
CHIRON                                Structural Mechanics Session •
COURSE MATERIAL                     | CHIRON
current problem/page                | short margin-note responses
                                    | [Too much][Just right][Too little] [Explain more]
CURRENT TASK · CURRENT STEP · ASSUMING YOU KNOW (click to edit)
```

---

## ARCHITECTURE

* Next.js, TypeScript, Tailwind.
* Persistence: SQLite or local JSON files. No Supabase or auth in V0.
* LLM: the Anthropic Claude API, behind one server-side interface so it can be swapped. Use a current model with vision. Key in `.env.local` as `LLM_API_KEY`. Never expose keys client-side.
* Structured output via tool use or JSON schema, validated with zod. Retry once on invalid output.

Internal state: UserProfile, Course, StudySession, Document, CurrentTask, CurrentStep, KnowledgeState, DepthPreference, SideQuestion.

Do NOT send the whole chat history. Build a context packet:

```
USER (profile, depth preference)
COURSE
KNOWN / UNCERTAIN CONCEPTS
CURRENT PAGE IMAGE + TEXT
CURRENT TASK / STEP
SIDE QUESTION (if any) + PARENT TASK
RECENT RELEVANT INTERACTIONS (last few turns)
RECENT DEPTH FEEDBACK
```

Model output:

```json
{
  "response": "...",
  "explanationDepth": 1,
  "sources": [{"type": "material|inference|general", "ref": "p. 342"}],
  "calculationsVerified": true,
  "detectedConcepts": [],
  "knowledgeUpdates": [],
  "taskUpdate": null,
  "sideQuestion": "open|close|none"
}
```

---

## SYSTEM PROMPT RULES

You are Chiron, a contextual learning companion.
Your goal is the smallest correct intervention that lets the learner continue.
Aim at what the learner is specifically confused about, not the whole topic.
Assume competence where the profile supports it. Don't explain prerequisites the learner knows unless asked.
Verify every calculation with the math tool before stating it.
If the learner states something wrong, tell them plainly and show where. Never validate an incorrect step.
Match the notation and conventions of the learner's material. Cite it when you use it.
Separate what the material says, what you infer, and general knowledge. If uncertain, say so briefly.
Remember the learner's current task through side questions.
Prefer helping the learner reason over completing graded work for them.
Do not overwhelm the learner.

---

## DEMO MODE

The prototype must be demonstrable immediately. Include a seeded demo session with a fictional Structural Mechanics problem and a short sample document we are legally free to include (write it yourself).

Seed the learner as an aerospace engineering junior who knows statics, mechanics of materials and linear algebra.

The demo must support:
1. "Why is that zero?" → short answer grounded in the problem
2. "Wait, what are the six components of strain again?" → side question
3. "Got it." → returns to the problem
4. "Okay what do I do next?" → next step, not the full solution
5. "I think the reaction is wL/2" (deliberately wrong) → CHIRON says it's wrong and why
6. "Explain more" → one level deeper
7. [Too much] → next response is visibly shorter

---

## BASELINE MODE (for comparison testing)

Add a hidden toggle (e.g. `?mode=baseline`) that uses the same UI and material but a plain "helpful tutor" prompt with no depth control, learner model or verification. This lets us test whether CHIRON's behaviors, not the UI, are what students prefer.

---

## INSTRUMENTATION

Record locally:
* session duration, mode (chiron/baseline)
* number of questions, response length (words)
* explanation depth per response
* depth feedback events (too much / just right / too little)
* "explain more" events
* learner-model corrections
* side questions opened/closed
* errors the student flagged

Make a simple internal session summary page, for example:

"14 questions. Average response 31 words. Depth feedback: 9 just right, 3 too much, 1 too little. 3 explain-more requests. 2 knowledge assumptions corrected. 1 wrong student step caught."

No invasive analytics.

---

## WHAT NOT TO BUILD

Payments, pricing, marketing site, social features, mobile app, voice, camera, LMS, professor dashboard, flashcards, quizzes, gamification, marketplace, signup or auth, enterprise features.

---

## BUILD PHASES

Each phase must end with a running app that works end to end.

- **Phase 1 — Core loop on the demo session (no upload yet).** Seeded material, profile and learner model. Chat with depth levels, depth feedback, explain more, side questions, math verification, wrong-answer correction. Session state strip.
- **Phase 2 — Real material.** PDF upload with page images, page navigation, mark current problem, screenshot paste. Two-screen onboarding.
- **Phase 3 — Research.** Instrumentation, session summary, baseline mode.

After each phase: run the app, test the demo script, fix errors, then continue. No placeholder buttons that do nothing.

---

## BEFORE CODING

1. Restate the core product hypothesis in one paragraph.
2. Identify the minimum architecture.
3. Propose the screen structure.
4. Flag anything in this spec that should not be in V0.
5. Write the plan to docs/PLAN.md.

## WHEN FINISHED

1. Run all checks (typecheck, lint, build).
2. Give me exact commands to start it.
3. Tell me where to put the API key.
4. Give me a 5-minute demo script.
5. List the three riskiest assumptions this prototype can test, and which logged metric tests each.

## SUCCESS CRITERION

Five students from our survey list each do 20 minutes of real homework in CHIRON and 20 minutes in baseline mode. CHIRON wins if:
* most of them prefer it,
* "just right" is the most common depth feedback,
* and it states no uncorrected wrong answers.

The feeling we want: "Going back to normal ChatGPT feels annoying."
