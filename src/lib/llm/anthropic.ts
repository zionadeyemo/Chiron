import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { isMathTool, runMathTool } from "../math";
import type { MathCall } from "../types";
import { issuesText, parseJsonText, toJsonSchema } from "./schema";
import { MATH_TOOL_SPECS } from "./tools";
import { LLMError, type Effort, type LLM, type Part, type StructuredRequest, type TextRequest, type Tier, type ToolTurnRequest } from "./types";

const MAX_TOOL_ITERATIONS = 8;

function toBlocks(parts: Part[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = parts.map((p) =>
    p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } },
  );
  // Cache the request body so tool-loop iterations reuse it.
  const last = blocks[blocks.length - 1];
  if (last && (last.type === "text" || last.type === "image")) last.cache_control = { type: "ephemeral" };
  return blocks;
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

export class AnthropicLLM implements LLM {
  readonly provider = "anthropic" as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly models: Record<Tier, string>,
    /** Default effort per tier: LLM_EFFORT (chat) and LLM_PLANNER_EFFORT (planner). */
    private efforts: Partial<Record<Tier, Effort>> = {},
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  private async create(
    tier: Tier,
    system: string,
    messages: Anthropic.Beta.BetaMessageParam[],
    extra: { tools?: Anthropic.Beta.BetaTool[]; format?: Record<string, unknown>; effort?: Effort },
  ) {
    const effort = extra.effort ?? this.efforts[tier] ?? (tier === "strong" ? "high" : "medium");
    try {
      const res = await this.client.beta.messages.create({
        model: this.models[tier],
        max_tokens: 16000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
        ...(extra.tools ? { tools: extra.tools } : {}),
        output_config: { effort, ...(extra.format ? { format: { type: "json_schema", schema: extra.format } } : {}) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (res.stop_reason === "refusal") throw new LLMError("The model declined this one. Try rephrasing.", "refusal");
      return res;
    } catch (err) {
      if (err instanceof LLMError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new LLMError("Anthropic rejected the API key (LLM_API_KEY).", "auth");
      if (err instanceof Anthropic.RateLimitError) throw new LLMError("Rate limited by the API — wait a moment and try again.", "rate_limit");
      if (err instanceof Anthropic.APIError) throw new LLMError(`API error ${err.status ?? ""}: ${err.message}`, "api");
      if (err instanceof Anthropic.APIConnectionError) throw new LLMError("Couldn't reach the API. Check your connection.", "network");
      throw err;
    }
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: toBlocks(req.parts) }];
    const format = toJsonSchema(req.schema);
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.create(req.tier, req.system, messages, { format, effort: req.effort });
      let problem: string;
      try {
        const parsed = req.schema.safeParse(parseJsonText(textOf(res.content)));
        if (parsed.success) return parsed.data;
        problem = issuesText(parsed.error);
      } catch (e) {
        problem = (e as Error).message;
      }
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: `That output was invalid (${problem}). Return the corrected JSON only.` });
    }
    throw new LLMError(`The ${req.label} step returned malformed output twice.`, "invalid_output");
  }

  async toolTurn<T>(req: ToolTurnRequest<T>) {
    const tools: Anthropic.Beta.BetaTool[] = [
      ...MATH_TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Beta.BetaTool["input_schema"] })),
      { name: "respond", description: req.respond.description, input_schema: toJsonSchema(req.respond.schema) as Anthropic.Beta.BetaTool["input_schema"] },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: toBlocks(req.parts) }];
    const mathCalls: MathCall[] = [];
    let schemaRetried = false;
    let reviewRetried = false;
    let protocolRetried = false;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const res = await this.create(req.tier, req.system, messages, { tools, effort: req.effort });
      messages.push({ role: "assistant", content: res.content });
      const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (uses.length === 0) {
        // Forced tool choice isn't available on current models, so nudge once.
        if (protocolRetried) throw new LLMError("The tutor didn't finish its answer. Try again.", "invalid_output");
        protocolRetried = true;
        messages.push({ role: "user", content: "Finish by calling the respond tool." });
        continue;
      }
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of uses) {
        if (isMathTool(tu.name)) {
          const { ok, output } = runMathTool(tu.name, tu.input);
          mathCalls.push({ tool: tu.name, input: tu.input, output, ok });
          results.push({ type: "tool_result", tool_use_id: tu.id, content: output, is_error: !ok });
          continue;
        }
        if (tu.name !== "respond") {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `unknown tool ${tu.name}`, is_error: true });
          continue;
        }
        const parsed = req.respond.schema.safeParse(tu.input);
        if (!parsed.success) {
          if (schemaRetried) throw new LLMError("The tutor's answer didn't match the expected format.", "invalid_output");
          schemaRetried = true;
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Invalid respond payload: ${issuesText(parsed.error)}. Call respond again.` });
          continue;
        }
        const objection = reviewRetried ? null : (req.respond.review?.(parsed.data, mathCalls) ?? null);
        if (objection) {
          reviewRetried = true;
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: objection });
          continue;
        }
        return { payload: parsed.data, mathCalls };
      }
      messages.push({ role: "user", content: results });
    }
    throw new LLMError("The tutor took too many steps without answering. Try again.", "invalid_output");
  }

  async text(req: TextRequest): Promise<string> {
    const messages: Anthropic.Beta.BetaMessageParam[] = req.history.map((h) => ({ role: h.role, content: h.text }));
    messages.push({ role: "user", content: toBlocks(req.parts) });
    const text = textOf((await this.create(req.tier, req.system, messages, { effort: req.effort })).content);
    if (!text) throw new LLMError("The tutor returned an empty answer.", "invalid_output");
    return text;
  }
}
