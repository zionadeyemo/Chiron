# CHIRON V0 — Implementation Plan

Spec: [`docs/SPEC.md`](SPEC.md). This file records the decisions made against it.

## 1. Core hypothesis

Students don't need a smarter answer engine; they need a *better-sized* one. If a tutor
(a) answers the exact thing the student is stuck on in one to three sentences by default,
(b) is verifiably correct and refuses to agree with wrong steps, and (c) lets the student
steer depth with one tap that measurably changes what comes next, then students will rate
most responses "just right", catch fewer errors themselves, and find generic chat tutors
annoying by comparison. Context (current page, learner model, side-question slot) exists
only to make (a)–(c) possible without the student re-explaining themselves. The baseline
mode isolates the behaviour from the UI so we can tell which one students are preferring.

## 2. Minimum architecture

```
Browser (Next.js client)                    Server (Next.js route handlers)
───────────────────────                    ────────────────────────────────
Session page                               POST /api/sessions/:id/ask
 ├ Material pane (demo pages / pdf.js /      ├ build ContextPacket (no full history)
 │   pasted screenshot)                      ├ Tutor (src/lib/llm) — one interface
 ├ Chiron margin (notes + controls)          │    ├ AnthropicTutor  (claude-opus-5-5, vision)
 └ State strip (task/step/concepts)          │    └ MockTutor       (LLM_MOCK=1, offline dev only)
                                             ├ math tools (mathjs, server-side)
pdf.js renders page → PNG ─────────────────▶ ├ zod-validate `respond` output, retry once
                                             ├ apply depth / learner-model / task rules
                                             └ append instrumentation events
                                           data/  (local JSON + JSONL, gitignored)
```

- **Stack:** Next.js (App Router) + TypeScript + Tailwind. KaTeX via `react-markdown` +
  `remark-math` + `rehype-katex`.
- **Persistence:** local JSON files under `data/` (no native deps → no Windows build pain).
  `profiles.json`, `sessions/<id>.json`, `events/<id>.jsonl`, `documents/<id>/…`.
- **LLM:** `@anthropic-ai/sdk`, `claude-opus-5-5` (vision, adaptive thinking always on;
  `effort` configurable, default `medium`). Key read from `LLM_API_KEY` server-side only.
  Server-side refusal fallback (`fallbacks: "default"`) enabled.
- **Structured output:** the model finishes every turn by calling a strict `respond` tool.
  Its input is validated with zod; on failure we re-ask once with the validation error.
  (Forced `tool_choice` is not available on this model, so the instruction lives in the
  prompt and the retry covers the rare miss.)
- **Math verification:** server tools backed by mathjs — `calculate` (numeric, units),
  `check_equivalent` (symbolic simplify + random-point numeric test), `derivative`,
  `solve_linear_system`. The server, not the model, decides whether "verified" is shown:
  the badge appears only when a math tool actually ran without error that turn.
- **Context packet** (per request, never the whole transcript): profile + depth target,
  course, relevant known/uncertain concepts, current page image + text (or screenshot),
  current task/step, side question + parent task, last 4 exchanges (compressed), recent
  depth feedback, the student's pointed-at selection (if any).

### Depth controller (deterministic, server-side)

- `depthScore` (1.0–4.0) per student, persisted. Default from onboarding: short hints 1.25,
  step-by-step 1.75, full explanations 3.0.
- Too much: −0.5 and the *next* response gets a hard word cap of 50% of the flagged one.
  Too little: +0.5. Just right: nudges the score 25% toward the rated response's level.
- Target level = round(score), clamped 1–4. Word budget per level ≈ 30 / 60 / 120 / 220.
- Explain more = re-ask the same question at exactly `previousLevel + 1`, aimed at the
  same confusion. Logged as its own event.
- If the model overshoots the budget by >2× (outside explain-more), we ask it once to
  compress. Students who keep pressing "Too little" drift up to level 3–4 automatically.

### Learner model rules (conservative)

Evidence strength: student edit > depth feedback > model guess. The model may *propose*
`knowledgeUpdates`; the server applies them only when the concept is not student-set, never
promotes straight to `known` from a single guess (goes to `learning` first), and caps
model-sourced changes at two per turn. Every student edit is logged as a correction.

## 3. Screen structure

1. **`/`** — Home: start the seeded demo, continue a session, or start a new one.
2. **`/start`** — Onboarding, two screens: (1) "What are you working on?" drop/choose PDF
   or Ctrl+V screenshot; (2) "Tell Chiron enough to teach you well." → START SESSION.
3. **`/session/[id]`** — The hero. Three regions:
   - Top bar: `CHIRON` · course · session dot · Learner-model drawer · Summary.
   - Left (≈60%): **Material** — paper page, page nav, "I'm on problem…" marker,
     text selection = "pointing at" for the next question, paste screenshot anywhere.
   - Right (≈40%): **Chiron margin** — student lines as small italic marginalia, Chiron
     notes as ruled margin annotations with depth tag, sources, verified badge, and the
     always-present `Too much · Just right · Too little | Explain more` row. One-line input.
   - Bottom: **State strip** — CURRENT TASK · CURRENT STEP · ASSUMING YOU KNOW · MIGHT
     NEED REFRESHING (· SIDE QUESTION when open). Every item clickable to correct.
4. **`/session/[id]/summary`** — internal research summary sentence + per-turn table.
5. **`/research`** — list of all sessions with mode and headline metrics.

Baseline: any session URL with `?mode=baseline` at creation → same UI, plain tutor prompt,
normal chat history, no depth control / learner model / math tools. Controls still log.

## 4. Spec items flagged for V0

- **Explicit "explain more" is one level, always.** Not adaptive jumps — keeps it legible.
- **"Render PDF pages to images" server-side** pulls in native canvas deps. V0 renders in
  the browser with pdf.js and uploads the current page PNG; same result, zero native deps.
- **Seeded demo material is authored text + LaTeX, not a PDF.** We own the source, so
  sending it as exact text is lossless; page images matter for *uploaded* PDFs.
- **Per-response "flag an error"** isn't in the control list but is needed to log "errors
  the student flagged". Added as a tiny, quiet link — not a third button group.
- **Not built:** multi-user, auth, cloud sync, document search across a whole textbook
  (we only send the current page ± the marked problem), OCR fallback, dark mode.
- **Risk to note:** "no uncorrected wrong answers" can't be fully proven by a math tool —
  conceptual errors aren't caught by mathjs. The flag link + summary are the safety net.

## 5. Phases

- **Phase 1 — Core loop on the demo.** Data model + JSON store, seed (profile, learner
  model, Chapter 7 sample pages, Problem 7.18), tutor interface + Anthropic + mock, math
  tools, depth controller, side-question slot, state strip, margin UI with KaTeX.
  ✔ Run the demo script.
- **Phase 2 — Real material.** PDF upload + pdf.js viewer + page images to model, page nav,
  mark current problem, Ctrl+V screenshots, two-screen onboarding. ✔ Re-run demo + upload.
- **Phase 3 — Research.** Event log, summary page, research index, baseline mode.
  ✔ Typecheck, lint, build; demo script in both modes.

## 6. Status (as built, 2026-10-07)

All three phases are built. Typecheck, lint and production build are clean.

- **Verified end to end** with the offline mock tutor (`LLM_MOCK=1`): demo script, depth
  feedback ordering (a "Too much" tapped just before asking shapes that very answer), explain
  more, side question open/close, wrong-step logging, PDF onboarding (page images + text
  stored for the model), problem marking from a text selection, Ctrl+V screenshots, baseline
  mode, summary and research pages.
- **Not yet verified against the live model**: there was no API key in the build environment.
  The Anthropic path (tool loop, `respond` validation and retry, verification and length
  enforcement) typechecks against the SDK but needs a first live run of `docs/DEMO.md`.
- Refusal fallback is enabled (`fallbacks: "default"`), so a safety-classifier decline is
  retried server-side on a fallback model.
- `scripts/print-packet.ts` prints the exact context packet for a session, for prompt debugging.
- Not built: an in-app "which did you prefer?" question. Collect preference in the post-session
  interview.
- **Providers (2026-10-07):** the tutor now runs on Anthropic or Google Gemini behind the same
  interface, chosen from the key (`sk-ant-…` → Anthropic, else Gemini; `LLM_PROVIDER` overrides).
  Tool schemas (`tools.ts`) and answer checks (`review.ts`) are shared, so both providers enforce
  the same rules. Gemini uses forced function calling, so every turn ends in `respond`.
- **First live run (Gemini, `gemini-flash-latest`, default thinking):** the full `docs/DEMO.md`
  script passed. Every answer stayed within its word budget; "Too much" on a 58-word note gave a
  17-word next answer; R_B = 3wL/8 and R_A = 5wL/8 were tool-verified. Latency was 7–25 s per
  answer; math-checked turns are slowest. `LLM_EFFORT=low` gave 4–17 s, but in that run the
  wrong-answer correction worked the solution out instead of asking the student to.
