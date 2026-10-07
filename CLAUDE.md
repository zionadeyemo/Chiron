# CHIRON

A study companion for college STEM problem-solving. The product bet: help that is the
**right size**, aimed at **exactly** what the student is confused about, and **correct**.

- **Read first:** [`docs/SPEC.md`](docs/SPEC.md) — the founding spec (survey findings, behaviours
  in priority order, UI tone, what not to build). It wins any disagreement.
- **Decisions & architecture:** [`docs/PLAN.md`](docs/PLAN.md).
- **Next.js here is v16** — see [`AGENTS.md`](AGENTS.md); check `node_modules/next/dist/docs/`
  before using an unfamiliar API.

## Map

- `src/lib/tutor/` — the LLM boundary. `index.ts` picks Anthropic, Gemini (detected from the key) or the offline mock;
  `review.ts` holds the checks every provider applies to an answer (schema, math verified, length);
  `prompts.ts` holds the Chiron and baseline system prompts; `packet.ts` builds the per-turn
  context packet (never the whole transcript).
- `src/lib/depth.ts` — deterministic depth controller (feedback → level + word budget).
- `src/lib/learner.ts` — conservative learner-model update rules.
- `src/lib/math.ts` — mathjs tools the model must use for any calculation.
- `src/lib/store.ts` — local JSON persistence in `data/` (gitignored).
- `src/lib/events.ts` — research instrumentation + session summary.
- `src/lib/demo/` — the seeded demo (authored Chapter 7 material, Problem 7.18, learner).

## Rules of thumb

- Every behaviour change should serve the spec's priority order: right-sized help >
  accuracy/honesty > context > learner model > pedagogy > continuity.
- Keep the UI quiet: paper, margin notes, mono labels. No chat bubbles, gradients, or cards.
- `npm run check` = typecheck + lint + build. Run it before calling work done.
