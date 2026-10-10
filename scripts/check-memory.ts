// Phase 3 acceptance (brief 3.3), against the live LLM in .env.local:
//  1. A full guided problem with personalization ON produces no memory-announcing phrases.
//  2. With personalization OFF, no request to the model contains learner context — and with it ON,
//     the requests do. (Same tone either way; only the context changes.)
//   npx tsx --conditions=react-server scripts/check-memory.ts   → writes docs/MEMORY-CHECK.md
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
process.env.CHIRON_DATA_DIR = mkdtempSync(path.join(tmpdir(), "chiron-memory-"));

const QUESTIONS = ["why this step?", "where does that come from?", "I don't get it", "what is this for?"];

async function main() {
  const { getLLM } = await import("../src/lib/llm");
  const { db } = await import("../src/lib/db");
  const ws = await import("../src/lib/workspace");
  const board = await import("../src/lib/board/actions");
  const { findMemoryPhrase } = await import("../src/lib/board/memory-phrases");
  const fixture = JSON.parse(readFileSync("fixtures/problems/02-propped-cantilever.json", "utf8"));

  // Spy on every model request: does it carry learner context?
  const llm = getLLM() as unknown as Record<string, (req: { parts: { type: string; text?: string }[]; label: string }) => Promise<unknown>>;
  const requests: { label: string; learner: boolean }[] = [];
  for (const method of ["structured", "toolTurn", "text"]) {
    const original = llm[method].bind(llm);
    llm[method] = (req) => {
      requests.push({ label: req.label, learner: req.parts.some((p) => p.type === "text" && p.text?.includes("<learner>")) });
      return original(req);
    };
  }

  // A student with a real background, so there's memory to (not) announce.
  const profile = await ws.ensureProfile();
  await db().update("profiles", profile.id, (p: typeof profile) => {
    p.major = "Aerospace Engineering";
    p.year = "Junior";
    p.previousCourses = ["Statics", "Mechanics of Materials", "Linear Algebra"];
    const at = new Date().toISOString();
    p.knowledge = {
      "static equilibrium": { state: "known", source: "profile", updatedAt: at },
      "cantilever deflection": { state: "known", source: "profile", updatedAt: at },
      "method of superposition": { state: "learning", source: "profile", updatedAt: at },
      "compatibility conditions": { state: "uncertain", source: "profile", updatedAt: at },
    };
  });

  async function guided(personalize: boolean, maxSteps: number) {
    const course = await ws.createCourse(personalize ? "Memory check — personalized" : "Memory check — not personalized");
    if (!personalize) await ws.updateCourse(course.id, "", { personalize: false });
    const sessionId = await ws.startOrResumeVisit(course.id);
    const from = requests.length;
    await ws.sendMessage(course.id, { sessionId, text: fixture.statement, imageRefs: [], mode: "new_problem" });
    const view = await ws.getView(course.id, sessionId);
    const problemId = view.board!.problem.id;
    await board.ensurePlan(problemId, sessionId);
    let q = 0;
    for (let i = 0; i < maxSteps; i++) {
      const v = await ws.getView(course.id, sessionId);
      if (!v.board?.hasNextStep) break;
      await board.applyAction(problemId, sessionId, { type: "next" });
      await ws.sendMessage(course.id, { sessionId, text: QUESTIONS[q++ % QUESTIONS.length], imageRefs: [], mode: "normal" });
      if (i === 1) {
        const t = await ws.getView(course.id, sessionId);
        const last = [...t.messages].reverse().find((m) => m.role === "chiron" && m.depth != null);
        if (last) await ws.sendMessage(course.id, { sessionId, text: "", imageRefs: [], mode: "normal", explainMoreOf: last.id });
      }
    }
    const final = await ws.getView(course.id, sessionId);
    const replies = final.messages.filter((m) => m.role === "chiron").map((m) => m.text);
    const phrases = replies.map((r) => findMemoryPhrase(r)).filter(Boolean);
    return { replies, phrases, requests: requests.slice(from), revealed: final.board!.steps.length - 1 };
  }

  console.log("▶ personalized guided problem");
  const on = await guided(true, 8);
  console.log(`  ${on.replies.length} replies, ${on.phrases.length} memory phrases, ${on.requests.filter((r) => r.learner).length}/${on.requests.length} requests with learner context`);
  console.log("▶ personalization off");
  const off = await guided(false, 3);
  console.log(`  ${off.replies.length} replies, ${off.phrases.length} memory phrases, ${off.requests.filter((r) => r.learner).length}/${off.requests.length} requests with learner context`);

  const byLabel = (rs: typeof requests) =>
    Object.entries(
      rs.reduce<Record<string, [number, number]>>((acc, r) => {
        const [w, n] = acc[r.label] ?? [0, 0];
        acc[r.label] = [w + (r.learner ? 1 : 0), n + 1];
        return acc;
      }, {}),
    )
      .map(([label, [w, n]]) => `${label} ${w}/${n}`)
      .join(", ");

  const pass1 = on.phrases.length === 0;
  const pass2 = off.requests.every((r) => !r.learner) && on.requests.some((r) => r.learner);
  const md = [
    "# Memory check (Phase 3)",
    "",
    `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} against the live model. Regenerate with \`npx tsx --conditions=react-server scripts/check-memory.ts\`.`,
    "",
    `1. **No memory-announcing phrases in a full guided problem: ${pass1 ? "PASS" : "FAIL"}.** Problem 7.18 with personalization on, ${on.revealed} steps revealed, ${on.replies.length} Chiron replies (questions at every step, one Explain more). Phrases found: ${on.phrases.length ? on.phrases.join("; ") : "none"}. The chat post-check regenerates once if a reply does announce memory, so this measures what students actually see.`,
    `2. **Personalization off removes learner context from requests: ${pass2 ? "PASS" : "FAIL"}.** Requests carrying \`<learner>\` — on: ${byLabel(on.requests)}; off: ${byLabel(off.requests)}. (Intake and work-reading calls never carry it.) The \`plan_ready\`, \`step_question\` and \`explain_more\` events record \`personalized\` for the same check in the event log.`,
    "",
    "## Replies (personalized run)",
    "",
    ...on.replies.map((r, i) => `${i + 1}. ${r.replace(/\n+/g, " ")}`),
    "",
    "## Replies (personalization off)",
    "",
    ...off.replies.map((r, i) => `${i + 1}. ${r.replace(/\n+/g, " ")}`),
    "",
  ].join("\n");
  writeFileSync(path.join("docs", "MEMORY-CHECK.md"), md);
  console.log(`\n${pass1 && pass2 ? "PASS" : "FAIL"} — wrote docs/MEMORY-CHECK.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
