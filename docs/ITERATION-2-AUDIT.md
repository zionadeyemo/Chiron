# Iteration 2 — Audit of the V0 codebase

Audited 2026-10-08 at commit `f01af6b` ("Prepare CHIRON prototype for deployment").
About 5,900 lines of TypeScript, CSS and docs. Brief: [`ITERATION-2-PROMPT.md`](ITERATION-2-PROMPT.md).

## 1. Structure

| Path | What it does |
|---|---|
| `src/app/` | Next.js 16 App Router. Pages: `/` home, `/demo` (creates a seeded session), `/start` (two-screen onboarding), `/session/[id]` (study session), `/session/[id]/summary`, `/research`. |
| `src/app/api/` | Route handlers: `sessions` (create/list/get/patch), `sessions/[id]/ask` (one tutor turn), `feedback` (depth rating / flag), `concepts` (learner-model edits), `summary`, `events` (JSONL), `documents` (upload, file, page PNG+text cache), `profile`, `research`, `status`. |
| `src/lib/types.ts` | Domain types: `UserProfile`, `KnowledgeState`, `DepthPreference`, `StudySession` (holds `turns[]` inline), `Turn`, `CurrentTask`, `SideQuestion`, `DocumentMeta`. |
| `src/lib/session.ts` | The orchestration service: `ask()` (builds packet, calls tutor, applies side-question / task / learner updates, logs), `rate()`, `flag()`, `patchSession()`, `editConcept()`, `setDepthStyle()`. |
| `src/lib/tutor/` | The LLM boundary (below). |
| `src/lib/depth.ts` | Deterministic depth controller: levels 1–4, word budgets, score moved by Too much / Too little, "too much" word cap, `countWords`. |
| `src/lib/learner.ts` | Conservative learner-model rules (student > feedback > profile > model). |
| `src/lib/math.ts` | mathjs tools: `calculate`, `check_equivalent` (8 seeded random points), `derivative`, `solve_linear_system` (Cramer + back-substitution). |
| `src/lib/store.ts` | Local JSON persistence under `data/` with a per-file promise lock. |
| `src/lib/events.ts` | JSONL event log per session + `summarize()` for the research pages. |
| `src/lib/demo/` | Authored Chapter 7 (pp. 340–344), Problem 7.18, demo learner. |
| `src/lib/client/` | Browser helpers: `api.ts` (typed fetch), `pdf.ts` (pdf.js render, text layer, page-PNG upload), `material.ts`, `mode.ts` (`?mode=baseline`). |
| `src/components/` | UI (section 5). |
| `scripts/` | `copy-pdf-worker.mjs` (postinstall), `print-packet.ts` (debug the context packet). |

## 2. LLM provider abstraction and prompts

- One interface, `Tutor` (`src/lib/tutor/types.ts`), with two methods: `chiron(parts, opts)` (a tool loop
  ending in a `respond` call) and `baseline(history, parts)` (plain text).
- `tutor/index.ts` picks the implementation: `LLM_MOCK=1` → `MockTutor`; otherwise the key decides
  (`sk-ant-…` → `AnthropicTutor`, else `GeminiTutor`), overridable by `LLM_PROVIDER`. One model for
  everything (`LLM_MODEL`), one effort knob (`LLM_EFFORT`).
- Tool schemas are provider-neutral (`tools.ts`); answer checks are shared (`review.ts`: zod-validate
  `respond`, reject unverified calculations once, reject >2× the word budget once).
- Prompts live in `tutor/prompts.ts` (`CHIRON_SYSTEM`, `BASELINE_SYSTEM`). The per-turn context
  packet is built in `tutor/packet.ts`.
- **Gap for this iteration:** the interface is shaped around one chat turn. There's no generic
  "structured output" call, no notion of a strong vs. fast model, and nothing for planning,
  intake or judging work.

## 3. Storage

| Data | Where |
|---|---|
| Profiles (incl. learner model + depth preference) | `data/profiles/<id>.json` |
| Sessions, **with every turn (message) inline** | `data/sessions/<id>.json` |
| Uploaded files, PDF page PNGs + extracted text | `data/documents/<id>/…` |
| Instrumentation | `data/events/<sessionId>.jsonl` |

**This does not work on Vercel.** Serverless functions have a read-only filesystem except `/tmp`,
which is per-instance and wiped. Every write would fail (`EROFS`), so every API route that saves
anything would 500 on a Vercel deployment. Uploads need blob storage too (Vercel Blob or S3), and
Vercel caps a function's request body at 4.5 MB while the upload route allows 60 MB.

## 4. How problems and material enter a session

- **PDF:** onboarding screen 1 or the in-session `+ Material` button → `/api/documents` → pdf.js
  renders pages in the browser and uploads page PNG + text. The student then uses
  **Mark problem here** (optionally pre-filled from a text selection) to set the current task.
- **Screenshot:** Ctrl+V anywhere in a session (or on onboarding screen 1) → uploaded as a
  `screenshot` document and set as the current task, labelled "Pasted problem N". **No text is
  extracted**; the image is re-sent to the model on every turn.
- **Text:** there is **no way to paste a text problem**. Anything typed in the composer is a
  question about the current task.
- **Demo:** `/demo` seeds a session with Problem 7.18 already marked.

## 5. Study Session UI components

`SessionView` (state, request queue, paste handler) → `MaterialPane` (toolbar, mark-problem form,
pinned current problem, `PageViews`: `DemoPageView` + `Figures`, `PdfPageView`, `ScreenshotView`;
"Ask about this" selection chip) · `ChironMargin` (notes, depth controls, explain more, flag,
aside banner, pointing chip, composer) · `StateStrip` (task, step, assumed/refresh concepts, depth)
· `LearnerDrawer`. Shared: `Markdown` (KaTeX). Around it: `Home`, `Onboarding`, `StartDemo`,
`research/SessionSummary`, `research/ResearchIndex`.

## 6. Tests

**None.** No test runner is installed. The only automated checks are `npm run check`
(typecheck + lint + build). Behaviour was verified by hand with Playwright scripts and the mock tutor.

## 7. Bugs, dead ends and friction

1. **Chiron never starts.** After a paste or a marked problem it shows an empty-state note and waits
   — exactly the "staring at it" problem from testing.
2. **No text problems** and **no explicit new problem**. A pasted screenshot silently replaces the
   current task; the previous problem's conversation stays mixed into the same thread.
3. **Pasting an image always means "new problem".** There's no way to paste a photo of your own work
   into a question.
4. **Onboarding requires a file.** A student who only has a question can't get started except via the demo.
5. **Memory announces itself by design.** The system prompt tells the model to connect to what the
   student knows ("same idea as … in Linear Algebra"), and the state strip lists "assuming you know".
6. **Slow, opaque turns.** 7–25 s per answer on Gemini (tool round trips), shown only as "checking…".
7. **Possible hang:** `preparePages` awaits pdf.js page rendering with no timeout, and the client
   request queue waits on it; a PDF that never renders would block asking.
8. **Shared state on a deployment.** There is one local student (`me`) and no access control. On a
   shared deployment every visitor would see and modify the same profile, sessions and research
   logs. `/research`, `/session/*/summary` and `/api/sessions/*/events` are public.
9. Explain more is intentionally disabled at level 4 (not a dead button, but looks like one).
10. Baseline mode is only reachable via `?mode=baseline` on `/`, `/demo`, `/start` (by design).

No buttons were found that do nothing; all controls are wired.

## 8. Builds and runs

`npm run check` passes on the audited commit; `npm run dev` serves the app (verified 2026-10-08).
