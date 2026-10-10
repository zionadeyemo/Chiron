// Dev aid: time raw LLM calls per tier and effort.  npx tsx --conditions=react-server scripts/llm-timing.ts
import { readFileSync } from "node:fs";
import { z } from "zod";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { getLLM } = await import("../src/lib/llm");
  const llm = getLLM();
  const schema = z.object({ reply: z.string() });
  const parts = [{ type: "text" as const, text: "Which support gives a moment reaction: pin, roller or fixed? One sentence." }];
  for (const [label, effort] of [["default", undefined], ["low", "low"]] as const) {
    let t = Date.now();
    await llm.structured({ tier: "fast", system: "Answer briefly.", parts, schema, label: "timing", effort });
    console.log(`structured fast effort=${label}: ${Date.now() - t} ms`);
    t = Date.now();
    await llm.toolTurn({ tier: "fast", system: "Answer briefly, then call respond.", parts, label: "timing", effort, respond: { schema, description: "Your reply" } });
    console.log(`toolTurn   fast effort=${label}: ${Date.now() - t} ms`);
  }
}
void main();
