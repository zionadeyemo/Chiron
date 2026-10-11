# Decisions

Significant decisions, newest last. Iteration 2 brief: [`ITERATION-2-PROMPT.md`](ITERATION-2-PROMPT.md).

## Iteration 2

### D1 — Course workspace replaces the session page (Phase 0)
The unit of work is now a problem inside a course, with a whiteboard. `/session/[id]` (V0) is
replaced by `/course/[id]`. The brief's `sessionId` becomes a **visit**: opening a course after
30 minutes of inactivity starts a new visit, and every event carries the visit id. Students never
manage sessions; problems are what they see.

### D2 — Storage stays local files, behind a document-store interface (Phase 0)
The JSON-file store does **not** work on Vercel (read-only filesystem; `/tmp` is per-instance and
ephemeral). Before deploying, storage must move to a hosted database (Neon Postgres, one
`docs(collection, id, data jsonb)` table) and uploaded images/PDFs to blob storage (Vercel Blob).
All persistence now goes through `src/lib/db/` so that is one adapter, not a rewrite. The migration
isn't done here: it needs a database to test against.

### D3 — The plan is generated in its own request, not in the background (Phase 0)
After a problem is submitted, the response returns the fast setup immediately; the client then
calls `POST /api/problems/[id]/plan`, which runs Planner → Verifier → repair and returns the board.
It's idempotent (a second call while planning waits/polls). This avoids relying on background work
after a response, which serverless platforms may cut off, and is easy to test. On Vercel the route
needs `maxDuration` ≥ 120 s.

### D4 — Plans carry a `solution` map and step `resultEquation`s (Phase 0)
Beyond the brief's types, the Planner returns every unknown in terms of the givens, and each step's
key result as an equation. The verifier checks these against the original equations, and Check my
work uses them to judge any student equation: consistent with the true solution and matching a step
→ correct at that step; consistent but not in the plan → a valid alternative method; inconsistent →
incorrect. A line is only ever marked correct when this check passes.

### D5 — LLM layer: tiers instead of one model (Phase 0)
`strong` (Planner, work judging) and `fast` (setup, intent+chat, check questions). Env:
`LLM_PLANNER_MODEL`, `LLM_CHAT_MODEL`. `LLM_MODEL` still works as a fallback for both.

### D6 — V0 features retired in Phase 1, and why
- **Margin-note chat with Too much / Just right / Too little** → replaced by the whiteboard's
  Too big / Too small (step size, brief 2.9) plus Explain more in chat (depth).
- **State strip** (task / step / assuming you know) → the whiteboard shows the task and steps;
  "what Chiron assumes" moves to a collapsed per-course panel (Phase 3). Showing assumed
  knowledge on screen at all times conflicted with quiet memory.
- **Two-screen onboarding** → courses on the home page; the composer accepts any problem
  directly. A file is no longer required to start.
- **`/research` and per-session summary pages** → replaced by `/internal/summary` (Phase 4),
  which is protected. The V0 pages were public.
- **Screenshot-as-document** → a pasted screenshot is now a problem (read into text by the
  vision model), or an attachment to a question. Material is PDFs only.
- Kept: material viewer, PDF page images + text, Mark problem here, Ask about this, KaTeX,
  math tools, demo chapter and Problem 7.18, Gemini + Anthropic, baseline mode.

### D7 — Baseline mode becomes a per-course flag (Phase 1)
`?mode=baseline` on the home page or `/demo` creates a baseline course. In it, pasting a problem
gets a plain tutor's full answer in chat (like a general chatbot), with normal chat history and
no setup, whiteboard steps, learner model or verification.

### D8 — Problem detection: cheap heuristic first, then the model (Phase 1)
With no active problem, a message that looks like a problem (or has an image) goes to intake
first, so a pasted problem reaches its setup in one fast call (~3–7 s). Otherwise it goes to chat,
whose intent classification can still return `new_problem`. With an active problem, a suspected new
problem only ever shows the "Start this as a new problem?" chip.

### D9 — Gemini: fail fast instead of silent retries (Phase 1)
The Gemini SDK defaults to 5 attempts with exponential backoff, which produced 30–50 s silent
stalls when the API was busy. Now: 2 attempts, short backoff, 45 s timeout for chat calls and
240 s for planning. A failure shows "Try again" in the chat.

### D10 — CSS layering (Phase 1)
Custom global CSS now lives in `@layer base` / `@layer components`. Unlayered rules were beating
Tailwind utilities (e.g. `.label` colour and `:focus-visible`), a latent V0 bug.

### D11 — Planner: medium thinking, streamed, repairs may not merge steps (Phase 2)
Gemini Pro at default thinking took 57–170 s per plan; at medium it took 17–60 s with correct
answers on the fixtures tried. Default `LLM_PLANNER_EFFORT=medium` (set `high` for maximum care).
Planning calls are streamed with thought summaries so long silent calls aren't dropped by idle
network connections. A repair round may not merge or drop steps (it once turned 6 steps into 3 to
make checks pass); the best round is chosen by failures plus lost steps.

### D12 — Verifier accepts equations at the true solution, and definitions (Phase 2)
Planners write equilibrium equations (ΣM = 0) as "equivalence" checks; they aren't identities, so
they are accepted when they hold with the verified solution substituted. A result like
`mu = exp(2*t)` that introduces a new symbol is a definition available to later steps.

### D13 — Quiet memory: evidence-only updates plus a phrase post-check (Phase 3)
The learner model changes only on observed evidence (step revealed, hint used, "I got it",
check-my-work verdicts, check-question answers), via `board/memory.ts`. It is never announced: the
chat review rejects replies containing memory-announcing phrases ("as you mentioned", "I remember",
"since you know…") and regenerates once. `scripts/check-memory.ts` measures this against the live
model and writes `docs/MEMORY-CHECK.md`. The student sees and edits what is assumed in the
"What CHIRON assumes" panel; edits are logged as `learner_correction`.

### D14 — Personalization is a per-course toggle that removes context, not tone (Phase 3)
With Personalize off, planner and chat requests carry no `<learner>` block — only course and
problem. The system prompts are unchanged, so the comparison isolates the context. `plan_ready`,
`step_question` and `explain_more` events record `personalized` for later comparison.

### D15 — /internal/summary: computed from the event log, password-protected (Phase 4)
Metrics are computed on request from the JSONL event log (`lib/summary.ts`, pure and unit-tested),
not stored, so definitions can change without migrations. Definitions: "revealed before I got it"
counts steps after setup at the first press; hint-to-next ratio is hints ÷ next-step reveals; "plans
verified" counts `plan_ready` events with status `verified`; completion is by the student (the
verifier matched the final result in Check my work) or by full reveal (the last step was revealed).
Access: `INTERNAL_PASSWORD`, entered once into a form; the cookie holds a salted hash, httpOnly,
scoped to `/internal`. With no password set the page is open in development and closed in
production. No third-party analytics.

### D16 — Shared deployment: anonymous visitors, Supabase behind the same DocStore (deployment)
Goal: a URL for a handful of testers this week, without accounts.
- **Visitors.** `src/proxy.ts` gives every browser a random UUID in an HttpOnly `chiron_vid` cookie
  (1 year) and replaces a missing or malformed one. Server code reads it from the cookie only.
- **Isolation in the store.** `db()` resolves the visitor on every call and throws without one;
  stores are constructed per visitor (`FileStore`: `data/visitors/<id>/`; `SupabaseDocStore`: every
  query filtered on `visitor_id`, every object under `<id>/`). Application code is unchanged, and an
  id belonging to someone else is simply "not found" (404). Scripts use `runAsVisitor`.
- **Supabase**: one key-value `docs` table + `events` + a private bucket (`docs/SUPABASE.sql`),
  service-role key on the server only, RLS on with no policies. `update` is optimistic (a `version`
  column) since several function instances may write at once.
- **Selection**: Supabase if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; otherwise local files —
  except on Vercel production/preview, where the build and the server start both fail loudly.
- **Cost protection, not auth**: optional `ACCESS_CODES` gate (HMAC cookie; the code is recorded
  per visitor in `meta/access`), and 60 model calls per visitor per hour (`meta/llm-<hour>`).
- **Uploads** go straight from the browser to Storage with a signed upload URL issued for a key under
  the visitor's prefix; downloads are ≤10-minute signed URLs after the same check. Locally, the
  existing multipart routes are used. PDF pages were already rendered client-side by pdf.js.
- **New visitors** get the demo course on first use, with a pre-read statement (no model call) and
  without the fictional demo learner (that's only for `/demo`).
- **Changed**: `/internal/summary` now shows the viewer's own visitor data (it can't read across
  visitors through the store); cross-tester numbers come from SQL on `events`.
- **Local data** written before this change (directly under `data/`) is no longer read.
