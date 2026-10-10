import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

// Fixture problems (fixtures/problems/*.json): statements with known answers, used by the
// planner eval and by the offline mock LLM so end-to-end tests are deterministic.

export interface Fixture {
  id: string;
  title: string;
  /** Lowercase phrase that identifies the problem in a statement (for the mock). */
  match: string;
  statement: string;
  knownAnswer: {
    description: string;
    /** symbol → mathjs expression or number, checked against the plan's solution. */
    values: Record<string, string>;
    /** For conceptual problems: phrases the final answer must contain. */
    mustMention?: string[];
  };
  setup: { given: string[]; find: string[]; assumptions: string[] };
  /** A plan in the Planner's output format, returned by the mock. */
  referencePlan?: unknown;
}

// The six eval problems, plus test-only fixtures (e.g. one with a deliberately wrong check).
const DIRS = ["problems", "e2e"].map((d) => path.join(/*turbopackIgnore: true*/ process.cwd(), "fixtures", d));

let cache: Fixture[] | null = null;

export async function loadFixtures(): Promise<Fixture[]> {
  if (cache) return cache;
  const all: Fixture[] = [];
  for (const dir of DIRS) {
    let names: string[] = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
    } catch {
      continue;
    }
    for (const n of names) all.push(JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as Fixture);
  }
  return (cache = all);
}

export async function findFixture(statement: string): Promise<Fixture | null> {
  const s = statement.toLowerCase();
  return (await loadFixtures()).find((f) => s.includes(f.match)) ?? null;
}
