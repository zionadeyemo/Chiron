import "server-only";
import { imageParts, pageParts } from "../documents";
import { getLLM, type Part } from "../llm";
import { IntakeOut } from "./llm-schemas";
import { INTAKE_SYSTEM } from "./prompts";

// Reads a problem from text, an image or a PDF page and writes the Given/Find setup.
// One fast call, so the setup is on the board within a few seconds.

export interface IntakeInput {
  text?: string;
  imageRefs?: string[];
  pdf?: { docId: string; page: number };
}

export async function readProblem(input: IntakeInput): Promise<IntakeOut> {
  const parts: Part[] = [];
  if (input.pdf) {
    parts.push(...(await pageParts(input.pdf.docId, input.pdf.page)));
    parts.push({ type: "text", text: "The student marked a problem on this page." });
  }
  if (input.imageRefs?.length) parts.push(...(await imageParts(input.imageRefs)));
  if (input.text?.trim()) parts.push({ type: "text", text: `<problem>\n${input.text.trim().slice(0, 8000)}\n</problem>` });
  else if (input.pdf) parts.push({ type: "text", text: "<problem>(the marked problem on the page above)</problem>" });
  else parts.push({ type: "text", text: "<problem>(see the image)</problem>" });

  const out = await getLLM().structured({ tier: "fast", effort: "low", label: "intake", system: INTAKE_SYSTEM, parts, schema: IntakeOut });
  return { ...out, statement: out.statement.trim(), title: out.title.trim() };
}

/** Cheap pre-check: is this message worth sending to intake before chat? */
export function looksLikeProblem(text: string, hasImages: boolean): boolean {
  if (hasImages) return true;
  const t = text.trim();
  if (t.length < 50) return false;
  const imperative = /\b(find|determine|compute|calculate|solve|evaluate|show that|derive|sketch|what is the (value|magnitude))\b/i.test(t);
  const quantities = (t.match(/\d/g)?.length ?? 0) >= 2 || /[=]|\$/.test(t);
  return imperative && (quantities || t.length > 120);
}
