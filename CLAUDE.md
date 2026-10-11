# CHIRON

A step-by-step STEM tutor with a shared whiteboard. The bet: give the **minimum help** needed
before the student can continue on their own, and make it **correct**.

- **Current work — Iteration 2 (whiteboard tutoring):** [`docs/ITERATION-2-PROMPT.md`](docs/ITERATION-2-PROMPT.md)
  is the brief; [`docs/ITERATION-2-PLAN.md`](docs/ITERATION-2-PLAN.md) is the plan;
  [`docs/DECISIONS.md`](docs/DECISIONS.md) records every significant decision — add to it.
- **Background:** [`docs/SPEC.md`](docs/SPEC.md) (V0 spec, survey findings), [`docs/ITERATION-2-AUDIT.md`](docs/ITERATION-2-AUDIT.md)
  (state of the V0 code), [`docs/PLAN.md`](docs/PLAN.md) (V0 decisions).
- **Next.js here is v16** — see [`AGENTS.md`](AGENTS.md); check `node_modules/next/dist/docs/`
  before using an unfamiliar API.

## Map

- `src/lib/llm/` — provider-neutral LLM layer. `index.ts` picks Anthropic, Gemini (detected from the key) or the
  offline mock (`LLM_MOCK=1`, tests only); two tiers: **strong** (planner) and **fast** (chat, intake, reading work).
  All structured output is validated with zod (`schema.ts`); `tools.ts` exposes the mathjs tools.
- `src/lib/board/` — the whiteboard. `planner.ts` (plan → `verify.ts` → field-level repair), `project.ts`
  (**the only path to the client** — revealed steps only), `reveal.ts` (next / hint / got-it / resume, pure),
  `actions.ts` (server actions + events), `checkwork.ts` (verifier classifies, model only explains),
  `intake.ts`, `chat.ts` (per-turn packet + review), `intent.ts` (rules first, then the model),
  `memory.ts` / `memory-phrases.ts` (quiet memory), `prompts.ts`, `llm-schemas.ts`, `types.ts`.
- `src/lib/workspace.ts` — courses, visits (a new visit after 30 min idle), messages, problems, the workspace view.
- `src/lib/db/` — document store, **scoped per visitor** (D16): `db()` resolves the visitor from the `chiron_vid`
  cookie (or `runAsVisitor` in scripts/tests) on every call. `file.ts` (local, `data/visitors/<id>/`) or
  `supabase.ts` (deployed; `docs/SUPABASE.sql`). `src/proxy.ts` issues the cookie and runs the access-code gate.
  Deploying: `docs/DEPLOY.md`.
- `src/lib/events.ts` + `src/lib/summary.ts` — instrumentation and the metrics behind `/internal/summary`
  (`INTERNAL_PASSWORD`).
- `src/lib/depth.ts`, `learner.ts`, `math.ts`, `documents.ts` — depth budgets, learner model, mathjs, course material.
- `src/components/` — `workspace/` (layout, problem menu, assumptions panel), `board/`, `chat/`, `material/`.
- `fixtures/problems/` — planner eval set (`scripts/eval-planner.ts` → `docs/PLANNER-EVAL.md`);
  `scripts/check-memory.ts` → `docs/MEMORY-CHECK.md`.

## Rules of thumb

- Unrevealed solution steps never leave the server — not in API responses, not in the chat model's context.
- Never present unverified math as certain. Never mark a student's line correct unless the verifier agrees.
- Memory is quiet: it shapes explanations, it isn't announced.
- Never read a visitor id from a request body or URL, and never add an unscoped storage path. Secrets stay server-only
  (`npm run build` scans the client bundle for them).
- Keep the UI quiet: paper, margin notes, mono labels. No chat bubbles, gradients, or cards.
- `npm run check` = typecheck + lint + unit tests + build; `npm run test:e2e` = Playwright (mock LLM, port 3100). Run both before calling work done.
