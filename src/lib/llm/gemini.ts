import "server-only";
import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  GenerateContentResponse,
  type Part as GPart,
} from "@google/genai";
import { isMathTool, runMathTool } from "../math";
import type { MathCall } from "../types";
import { issuesText, parseJsonText, toJsonSchema } from "./schema";
import { MATH_TOOL_SPECS } from "./tools";
import { LLMError, type Effort, type LLM, type Part, type StructuredRequest, type TextRequest, type Tier, type ToolTurnRequest } from "./types";

const MAX_TOOL_ITERATIONS = 8;
/** Per-request ceilings: chat must stay snappy; planning a whole solution may take a while. */
const TIMEOUT_MS: Record<Tier, number> = { fast: 45_000, strong: 240_000 };

function logTiming(model: string, ms: number, failed = false, err?: unknown) {
  if (process.env.NODE_ENV !== "production" || process.env.LLM_DEBUG === "1") {
    const cause = err instanceof Error ? ` — ${err.name}: ${err.message}${err.cause ? ` (cause: ${(err.cause as { code?: string; message?: string }).code ?? (err.cause as Error).message})` : ""}` : "";
    console.info(`[llm] gemini ${model} ${ms} ms${failed ? ` (failed${cause})` : ""}`);
  }
}

/** Gather a streamed response into one response object (thought-summary parts dropped from text). */
async function collect(stream: AsyncGenerator<GenerateContentResponse>): Promise<GenerateContentResponse> {
  const parts: GPart[] = [];
  let last: GenerateContentResponse | undefined;
  for await (const chunk of stream) {
    last = chunk;
    for (const p of chunk.candidates?.[0]?.content?.parts ?? []) parts.push(p);
  }
  const res = new GenerateContentResponse();
  res.promptFeedback = last?.promptFeedback;
  res.usageMetadata = last?.usageMetadata;
  // Keep thought parts in the content (they carry signatures for multi-turn), but merge plain text.
  const merged: GPart[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (p.text != null && !p.thought && prev && prev.text != null && !prev.thought && !p.thoughtSignature && !prev.thoughtSignature) prev.text += p.text;
    else merged.push({ ...p });
  }
  res.candidates = [{ ...(last?.candidates?.[0] ?? {}), content: { role: "model", parts: merged } }];
  return res;
}
const THINKING: Record<Effort, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };

const toParts = (parts: Part[]): GPart[] =>
  parts.map((p) => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mediaType, data: p.base64 } }));

export class GeminiLLM implements LLM {
  readonly provider = "gemini" as const;
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly models: Record<Tier, string>,
    /** Default thinking per tier: LLM_EFFORT (chat) and LLM_PLANNER_EFFORT (planner). */
    private efforts: Partial<Record<Tier, Effort>> = {},
  ) {
    // The SDK's default is 5 attempts with exponential backoff (~30 s of silent waiting when
    // Gemini is busy). A tutor should fail fast and let the student retry instead.
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 2, initialDelay: 0.5, maxDelay: 2 } } });
  }

  private async generate(tier: Tier, contents: Content[], config: GenerateContentConfig, effort?: Effort): Promise<GenerateContentResponse> {
    const model = this.models[tier];
    const level = effort ?? this.efforts[tier];
    let res: GenerateContentResponse;
    const started = Date.now();
    try {
      if (tier === "strong") {
        // Planning calls think for a minute or more. Streamed with thought summaries, bytes keep
        // flowing, so an idle-connection timeout somewhere on the network can't drop the call.
        const stream = await this.ai.models.generateContentStream({
          model,
          contents,
          config: {
            ...config,
            thinkingConfig: { includeThoughts: true, ...(level ? { thinkingLevel: THINKING[level] } : {}) },
            httpOptions: { timeout: TIMEOUT_MS[tier] },
          },
        });
        res = await collect(stream);
      } else {
        res = await this.ai.models.generateContent({
          model,
          contents,
          config: {
            ...config,
            ...(level ? { thinkingConfig: { thinkingLevel: THINKING[level] } } : {}),
            httpOptions: { timeout: TIMEOUT_MS[tier] },
          },
        });
      }
      logTiming(model, Date.now() - started);
    } catch (err) {
      logTiming(model, Date.now() - started, true, err);
      if (err instanceof Error && /abort|timed? ?out/i.test(err.message) && !(err instanceof ApiError)) {
        throw new LLMError("Gemini took too long to answer — try again.", "network");
      }
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) {
          throw new LLMError("Google rejected the API key in .env.local (LLM_API_KEY).", "auth");
        }
        if (err.status === 404) throw new LLMError(`Gemini model "${model}" isn't available to this key. Check LLM_PLANNER_MODEL / LLM_CHAT_MODEL.`, "api");
        if (err.status === 429) throw new LLMError("Rate limited by the Gemini API — wait a moment and try again.", "rate_limit");
        if (err.status >= 500) throw new LLMError("The Gemini API had a temporary problem — try again.", "api");
        throw new LLMError(`Gemini API error ${err.status}: ${err.message.slice(0, 300)}`, "api");
      }
      if (err instanceof TypeError) throw new LLMError("Couldn't reach the Gemini API. Check your connection.", "network");
      throw err;
    }
    if (res.promptFeedback?.blockReason || res.candidates?.[0]?.finishReason === "SAFETY") {
      throw new LLMError("The model declined this one. Try rephrasing.", "refusal");
    }
    return res;
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const contents: Content[] = [{ role: "user", parts: toParts(req.parts) }];
    const config: GenerateContentConfig = {
      systemInstruction: req.system,
      responseMimeType: "application/json",
      responseJsonSchema: toJsonSchema(req.schema),
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.generate(req.tier, contents, config, req.effort);
      const text = res.text ?? "";
      let problem: string;
      try {
        const parsed = req.schema.safeParse(parseJsonText(text));
        if (parsed.success) return parsed.data;
        problem = issuesText(parsed.error);
      } catch (e) {
        problem = (e as Error).message;
      }
      const content = res.candidates?.[0]?.content;
      if (content) contents.push(content);
      contents.push({ role: "user", parts: [{ text: `That output was invalid (${problem}). Return the corrected JSON only.` }] });
    }
    throw new LLMError(`The ${req.label} step returned malformed output twice.`, "invalid_output");
  }

  async toolTurn<T>(req: ToolTurnRequest<T>) {
    const declarations: FunctionDeclaration[] = [
      ...MATH_TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })),
      { name: "respond", description: req.respond.description, parametersJsonSchema: toJsonSchema(req.respond.schema) },
    ];
    const config: GenerateContentConfig = {
      systemInstruction: req.system,
      tools: [{ functionDeclarations: declarations }],
      // Every turn is a function call, so it always ends in `respond`.
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
    };
    const contents: Content[] = [{ role: "user", parts: toParts(req.parts) }];
    const mathCalls: MathCall[] = [];
    let schemaRetried = false;
    let reviewRetried = false;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const res = await this.generate(req.tier, contents, config, req.effort);
      const content = res.candidates?.[0]?.content;
      const calls = res.functionCalls ?? [];
      if (!content || calls.length === 0) throw new LLMError("The tutor returned an empty answer.", "invalid_output");
      contents.push(content); // carries Gemini's thought signatures; echo it back unchanged

      const responses: GPart[] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        const reply = (response: Record<string, unknown>) => responses.push({ functionResponse: { id: call.id, name, response } });
        if (isMathTool(name)) {
          const { ok, output } = runMathTool(name, call.args ?? {});
          mathCalls.push({ tool: name, input: call.args ?? {}, output, ok });
          reply(ok ? { output } : { error: output });
          continue;
        }
        if (name !== "respond") {
          reply({ error: `unknown tool ${name}` });
          continue;
        }
        const parsed = req.respond.schema.safeParse(call.args ?? {});
        if (!parsed.success) {
          if (schemaRetried) throw new LLMError("The tutor's answer didn't match the expected format.", "invalid_output");
          schemaRetried = true;
          reply({ error: `Invalid respond payload: ${issuesText(parsed.error)}. Call respond again.` });
          continue;
        }
        const objection = reviewRetried ? null : (req.respond.review?.(parsed.data, mathCalls) ?? null);
        if (objection) {
          reviewRetried = true;
          reply({ error: objection });
          continue;
        }
        return { payload: parsed.data, mathCalls };
      }
      contents.push({ role: "user", parts: responses });
    }
    throw new LLMError("The tutor took too many steps without answering. Try again.", "invalid_output");
  }

  async text(req: TextRequest): Promise<string> {
    const contents: Content[] = req.history.map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));
    contents.push({ role: "user", parts: toParts(req.parts) });
    const text = (await this.generate(req.tier, contents, { systemInstruction: req.system }, req.effort)).text?.trim();
    if (!text) throw new LLMError("The tutor returned an empty answer.", "invalid_output");
    return text;
  }
}
