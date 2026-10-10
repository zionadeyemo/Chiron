# CHIRON

A step-by-step STEM tutor with a shared whiteboard. Paste a problem; Chiron reads it, lays out the
setup, and plans a verified solution it keeps hidden. The student asks for exactly as much as they
need — a hint, the next step, an explanation — or works ahead and has their lines checked.

- Brief: [`docs/ITERATION-2-PROMPT.md`](docs/ITERATION-2-PROMPT.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Demo script: [`docs/DEMO.md`](docs/DEMO.md)
- Planner accuracy: [`docs/PLANNER-EVAL.md`](docs/PLANNER-EVAL.md) · Quiet memory: [`docs/MEMORY-CHECK.md`](docs/MEMORY-CHECK.md)

## Run it

Requires Node 20+.

```bash
npm install
```

Put an **Anthropic or Google Gemini** API key in `.env.local` (gitignored, server-side only). The
provider is detected from the key: `sk-ant-…` is Anthropic, anything else is treated as Gemini.

```
LLM_API_KEY=your-key
```

```bash
npm run dev
```

Open http://localhost:3000.

| URL | What |
|---|---|
| `/` | Your courses: create, rename, archive, resume |
| `/course/<id>` | The workspace: chat, whiteboard, course material |
| `/demo` | A seeded course (structural mechanics, with Chapter 7 material) |
| `/internal/summary` | Validation metrics from the event log. Needs `INTERNAL_PASSWORD` in production. |

## Configuration (`.env.local`)

| Variable | Default | |
|---|---|---|
| `LLM_API_KEY` | — | Anthropic or Gemini key. Required. |
| `INTERNAL_PASSWORD` | — | Protects `/internal/summary`. Unset: open in dev, closed in production. **New.** |
| `LLM_PROVIDER` | detected | `anthropic` or `gemini`, to override detection. |
| `LLM_PLANNER_MODEL` | `gemini-pro-latest` / `claude-opus-5-5` | Strong tier: builds and repairs solution plans. **New.** |
| `LLM_CHAT_MODEL` | `gemini-flash-latest` / `claude-opus-5-5` | Fast tier: chat, problem intake, reading student work. **New.** |
| `LLM_MODEL` | — | Sets both tiers at once. |
| `LLM_PLANNER_EFFORT` | `medium` | Planner thinking: `low` / `medium` / `high`. **New.** |
| `LLM_EFFORT` | model default | Chat thinking. |
| `CHIRON_DATA_DIR` | `./data` | Where local data lives. **New.** |
| `LLM_DEBUG` | — | `1` logs per-call timings. |
| `LLM_MOCK` | — | `1` = deterministic offline tutor, for tests and UI work only. |

## Checks

```bash
npm run check
```

Typecheck, lint, unit tests (vitest) and a production build.

```bash
npm run test:e2e
```

Playwright against a dev server on port 3100 with the offline mock and a throwaway data directory
(first time: `npx playwright install chromium`).

```bash
npx tsx --conditions=react-server scripts/eval-planner.ts
```

Runs the planner on the six fixtures in `fixtures/problems/` against the live model and rewrites
`docs/PLANNER-EVAL.md` (~3 minutes). `scripts/check-memory.ts` does the same for `docs/MEMORY-CHECK.md`.

## Data

Stored locally in `data/` (gitignored): profile, courses, visits, problems, plans, boards, threads,
uploaded documents, and one JSONL event log per course. Delete the folder to reset.

## Deploying to Vercel

The app builds on Vercel as is, but these must change first (DECISIONS D2):

1. **Storage.** Local files don't persist on Vercel. Implement the `DocStore` interface in
   `src/lib/db` on Neon Postgres (documents as JSONB rows, events as an append-only table) and Vercel
   Blob (uploads, page images). Apart from read-only fixtures (`src/lib/fixtures.ts`),
   nothing outside `src/lib/db` touches the file system.
2. **Function duration.** Planning takes 15–60 s; `api/problems/[id]/plan` sets `maxDuration = 300` and the
   other model-calling routes 120 s. Check that your Vercel plan allows that function duration.
3. **Uploads.** Vercel request bodies cap at 4.5 MB. Images are already capped at 4 MB; course PDFs (60 MB
   locally) need client-side uploads straight to Blob.
4. **Access.** There are no accounts: everyone shares one profile. Put the deployment behind Vercel
   password protection (or add auth) and set `INTERNAL_PASSWORD`.
5. **Env vars.** Set `LLM_API_KEY`, `INTERNAL_PASSWORD`, and optionally the model/effort overrides above.
