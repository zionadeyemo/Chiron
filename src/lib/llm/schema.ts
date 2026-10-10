import { z } from "zod";

// Providers accept a subset of JSON Schema. zod still enforces the full schema on the way back,
// so we send the model the shape and strip constraints some providers reject.

const STRIP = new Set([
  "$schema",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
  "default",
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (!STRIP.has(k)) out[k] = clean(v);
  return out;
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" })) as Record<string, unknown>;
}

/** Compact validation message to send back to the model on a retry. */
export function issuesText(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Pull a JSON object out of model text (tolerates ```json fences). */
export function parseJsonText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in output");
  return JSON.parse(body.slice(start, end + 1));
}
