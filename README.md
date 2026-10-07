# Chiron — V0 prototype

A study companion for college STEM problem-solving. It sits in the margin of the student's
material and gives the **smallest correct intervention** that lets them continue.

- Spec: [`docs/SPEC.md`](docs/SPEC.md) · Plan & decisions: [`docs/PLAN.md`](docs/PLAN.md) · Demo script: [`docs/DEMO.md`](docs/DEMO.md)

## Run it

Requires Node 20+.

```bash
npm install
```

Put an **Anthropic or Google Gemini** API key in `.env.local` (already created, gitignored, server-side only).
The provider is detected from the key: `sk-ant-…` is Anthropic, anything else is treated as Gemini.

```
LLM_API_KEY=your-key
```

```bash
npm run dev
```

Open http://localhost:3000.

| URL | What |
|---|---|
| `/` | Home: demo, your own material, recent sessions |
| `/demo` | Fresh seeded demo session (Problem 7.18) |
| `/start` | Two-screen onboarding: upload a PDF or paste a screenshot, then your profile |
| `/session/<id>/summary` | Internal research summary for one session |
| `/research` | All sessions, Chiron vs. baseline |
| `?mode=baseline` | Hidden toggle on `/`, `/demo` or `/start`: same UI, plain tutor |

## Configuration (`.env.local`)

| Variable | Default | |
|---|---|---|
| `LLM_API_KEY` | — | Anthropic or Gemini key. Required. |
| `LLM_PROVIDER` | detected | `anthropic` or `gemini`, to override detection. |
| `LLM_MODEL` | `claude-opus-5-5` / `gemini-flash-latest` | Any vision-capable model of that provider (e.g. `gemini-pro-latest`). |
| `LLM_EFFORT` | model default | `low` / `medium` / `high` thinking. Low is faster but tends to hand over more of the solution. |
| `LLM_MOCK` | — | `1` = offline scripted tutor for UI work only. Labelled "mock tutor" in the UI. |

## Checks

```bash
npm run check
```

Runs typecheck, lint and a production build.

## Data

Everything is stored locally in `data/` (gitignored): profiles, sessions, uploaded documents and
page images, and one JSONL event log per session (`/api/sessions/<id>/events`). Delete the folder
to reset.
