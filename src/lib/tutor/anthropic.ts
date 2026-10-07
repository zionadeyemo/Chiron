import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { isMathTool, runMathTool } from "../math";
import type { MathCall } from "../types";
import type { PacketPart } from "./packet";
import { BASELINE_SYSTEM, CHIRON_SYSTEM } from "./prompts";
import { freshRetryState, PROTOCOL_NUDGE, reviewRespond, salvage } from "./review";
import type { RespondPayload } from "./schema";
import { MATH_TOOL_SPECS, RESPOND_SPEC } from "./tools";
import { TutorError, type BaselineHistoryItem, type ChironOptions, type ChironResult, type Tutor } from "./types";

type Effort = "low" | "medium" | "high";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
const EFFORT: Effort = (["low", "medium", "high"] as const).find((e) => e === process.env.LLM_EFFORT) ?? "medium";
const MAX_ITERATIONS = 8;

const TOOLS: Anthropic.Beta.BetaTool[] = [...MATH_TOOL_SPECS, RESPOND_SPEC].map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.schema as Anthropic.Beta.BetaTool["input_schema"],
}));

function toBlocks(parts: PacketPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = parts.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } },
  );
  // Cache the packet so tool-loop iterations within this turn reuse it.
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

export class AnthropicTutor implements Tutor {
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  private async create(params: {
    system: string;
    messages: Anthropic.Beta.BetaMessageParam[];
    tools?: Anthropic.Beta.BetaTool[];
  }) {
    try {
      const res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
        messages: params.messages,
        ...(params.tools ? { tools: params.tools } : {}),
        output_config: { effort: EFFORT },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (res.stop_reason === "refusal") {
        throw new TutorError("The model declined to answer this one. Try rephrasing.", "refusal");
      }
      return res;
    } catch (err) {
      if (err instanceof TutorError) throw err;
      if (err instanceof Anthropic.AuthenticationError) {
        throw new TutorError("Anthropic rejected the API key in .env.local (LLM_API_KEY).", "auth");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new TutorError("Rate limited by the API — wait a moment and ask again.", "rate_limit");
      }
      if (err instanceof Anthropic.APIError) {
        throw new TutorError(`API error ${err.status ?? ""}: ${err.message}`, "api");
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new TutorError("Couldn't reach the API. Check your connection.", "network");
      }
      throw err;
    }
  }

  async chiron(parts: PacketPart[], opts: ChironOptions): Promise<ChironResult> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: toBlocks(parts) }];
    const mathCalls: MathCall[] = [];
    const retried = freshRetryState();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await this.create({ system: CHIRON_SYSTEM, messages, tools: TOOLS });
      messages.push({ role: "assistant", content: res.content });

      const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        const text = textOf(res.content);
        if (!retried.protocol) {
          retried.protocol = true;
          messages.push({ role: "user", content: PROTOCOL_NUDGE });
          continue;
        }
        if (!text) throw new TutorError("The tutor returned an empty answer.", "invalid_output");
        return { payload: salvage(text, opts.targetLevel), mathCalls, retries: i };
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      let accepted: RespondPayload | null = null;
      for (const tu of toolUses) {
        if (isMathTool(tu.name)) {
          const { ok, output } = runMathTool(tu.name, tu.input);
          mathCalls.push({ tool: tu.name, input: tu.input, output, ok });
          results.push({ type: "tool_result", tool_use_id: tu.id, content: output, is_error: !ok });
        } else if (tu.name === "respond") {
          const review = reviewRespond(tu.input, mathCalls, opts, retried);
          if (review.kind === "accept") accepted = review.payload;
          else results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: review.message });
        } else {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `unknown tool ${tu.name}`, is_error: true });
        }
      }

      if (accepted) return { payload: accepted, mathCalls, retries: i };
      messages.push({ role: "user", content: results });
    }
    throw new TutorError("The tutor took too many steps without answering. Try asking again.", "invalid_output");
  }

  async baseline(history: BaselineHistoryItem[], parts: PacketPart[]): Promise<{ text: string }> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const h of history.slice(-10)) {
      messages.push({ role: "user", content: h.question });
      messages.push({ role: "assistant", content: h.response });
    }
    messages.push({ role: "user", content: toBlocks(parts) });
    const text = textOf((await this.create({ system: BASELINE_SYSTEM, messages })).content);
    if (!text) throw new TutorError("The tutor returned an empty answer.", "invalid_output");
    return { text };
  }
}
