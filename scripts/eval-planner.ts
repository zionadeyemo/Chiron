// Planner evaluation on the fixture problems (brief 2.11).
//   npx tsx --conditions=react-server scripts/eval-planner.ts            all fixtures, writes docs/PLANNER-EVAL.md
//   npx tsx --conditions=react-server scripts/eval-planner.ts 02 04      just these, prints only
// Uses the live LLM from .env.local (LLM_PLANNER_MODEL). Personalization is off so results
// don't depend on whoever's profile is on this machine.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
process.env.CHIRON_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), "chiron-eval-"));

interface Result {
  id: string;
  title: string;
  known: string;
  ok: boolean;
  status: string;
  steps: number;
  repairRounds: number;
  latencyMs: number;
  answer: string[];
  leaks: string[];
  checkQuestions: number;
  scaffolds: number;
  rounds: string[];
  failedChecks: string[];
  board: string[];
  error?: string;
}

async function main() {
  const { planSolution } = await import("../src/lib/board/planner");
  const { matchesKnownAnswer, hintLeaks } = await import("../src/lib/board/answers");
  const { resolveConfig } = await import("../src/lib/llm");
  const filter = process.argv.slice(2);
  const dir = path.join("fixtures", "problems");
  const fixtures = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && (!filter.length || filter.some((x) => f.startsWith(x))))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

  const course = { id: "c_eval00000000", name: "Engineering coursework", archived: false, personalize: false, mode: "chiron" as const, activeProblemId: null, documentIds: [], lastVisitId: null, createdAt: "", lastOpenedAt: "" };
  const results: Result[] = [];

  for (const f of fixtures) {
    const problem = {
      id: `p_eval${f.id.slice(0, 2)}000000`,
      courseId: course.id,
      sessionId: "v_eval00000000",
      source: "text" as const,
      title: f.title,
      statement: f.statement,
      setup: f.setup,
      status: "planning" as const,
      createdAt: "",
      updatedAt: "",
    };
    const rounds: string[] = [];
    console.log(`\n▶ ${f.id}`);
    try {
      const plan = await planSolution(problem, course, { block: null, stepSize: 0 }, 1, (round, p, quality) => {
        const line = `round ${round}: ${p.status}, ${p.steps.length - 1} steps, ${p.failedChecks.length} failed check(s)${p.failedChecks.length ? ": " + p.failedChecks.map((c) => `step ${c.stepIndex} — ${c.detail}`).join(" | ") : ""}${quality.length ? ` · ${quality.length} placeholder issue(s): ` + quality.map((q) => `step ${q.stepIndex} — ${q.detail}`).join(" | ") : ""}`;
        rounds.push(line);
        console.log("  " + line);
      });
      const answer = matchesKnownAnswer(plan, f.knownAnswer);
      const leaks = plan.steps.flatMap((s) => {
        const l = hintLeaks(s, f.statement);
        return l ? [`step ${s.index}: ${l}`] : [];
      });
      const r: Result = {
        id: f.id,
        title: f.title,
        known: f.knownAnswer.description,
        ok: answer.ok,
        status: plan.status,
        steps: plan.steps.length - 1,
        repairRounds: plan.repairRounds,
        latencyMs: plan.latencyMs,
        answer: answer.details,
        leaks,
        checkQuestions: plan.steps.filter((s) => s.checkQuestion).length,
        scaffolds: plan.steps.filter((s) => s.kind === "scaffold").length,
        rounds,
        failedChecks: plan.failedChecks.map((c) => `step ${c.stepIndex}: ${c.detail}`),
        board: plan.steps.slice(1).map((s) => `${s.index}. **${s.title}** (${s.kind}, ${s.verifyStatus}) — $${s.latex.replace(/\n/g, " ")}$\n   - hint 1: ${s.hints[0]}\n   - hint 2: ${s.hints[1]}${s.checkQuestion ? `\n   - check question: ${s.checkQuestion}` : ""}`),
      };
      results.push(r);
      console.log(`  → ${r.ok ? "ANSWER OK" : "ANSWER WRONG"} · ${r.status} · ${(r.latencyMs / 1000).toFixed(1)} s · leaks: ${leaks.length}`);
      for (const d of answer.details) console.log("    " + d);
    } catch (e) {
      console.log(`  → ERROR ${(e as Error).message}`);
      results.push({ id: f.id, title: f.title, known: f.knownAnswer.description, ok: false, status: "error", steps: 0, repairRounds: 0, latencyMs: 0, answer: [], leaks: [], checkQuestions: 0, scaffolds: 0, rounds, failedChecks: [], board: [], error: (e as Error).message });
    }
  }

  if (filter.length) return;
  const config = resolveConfig();
  const rows = results.map((r) => `| ${r.id} | ${r.ok ? "✓" : "✗"} | ${r.status} | ${r.steps} | ${r.repairRounds} | ${(r.latencyMs / 1000).toFixed(1)} s | ${r.leaks.length ? "⚠ " + r.leaks.length : "none"} | ${r.checkQuestions} | ${r.scaffolds} |`);
  const md = [
    "# Planner eval",
    "",
    `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} · provider ${config?.provider ?? "?"} · planner \`${config?.models.strong ?? "?"}\` · personalization off.`,
    "Regenerate with `npx tsx --conditions=react-server scripts/eval-planner.ts`. Fixtures: `fixtures/problems/`.",
    "",
    `**Final answers correct: ${results.filter((r) => r.ok).length} / ${results.length}.** Fully verified: ${results.filter((r) => r.status === "verified").length} / ${results.length}.`,
    "",
    "| Fixture | Answer | Verification | Steps | Repair rounds | Plan time | Hint leaks (auto) | Check questions | Scaffolds |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "Hint leaks (auto) is a code spot-check: a hint must not contain its step's result expression or a distinctive numeric value. The manual spot-check is recorded below each fixture.",
    "",
    ...results.flatMap((r) => [
      `## ${r.id} — ${r.title}`,
      "",
      `Known answer: ${r.known}. ${r.error ? `**Error:** ${r.error}` : ""}`,
      "",
      ...r.answer.map((d) => `- ${d}`),
      ...r.rounds.map((d) => `- ${d}`),
      ...(r.leaks.length ? r.leaks.map((d) => `- ⚠ ${d}`) : []),
      "",
      "<details><summary>Board as planned (titles, math, hints)</summary>",
      "",
      ...r.board,
      "",
      "</details>",
      "",
      "Manual hint spot-check: _(see the summary at the top of this file)_",
      "",
    ]),
  ].join("\n");
  writeFileSync(path.join("docs", "PLANNER-EVAL.md"), md);
  writeFileSync(path.join(process.env.CHIRON_DATA_DIR!, "eval-results.json"), JSON.stringify(results, null, 2));
  console.log("\nwrote docs/PLANNER-EVAL.md");
}

void main();
