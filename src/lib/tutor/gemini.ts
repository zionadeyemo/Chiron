import "server-only";
import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import { isMathTool, runMathTool } from "../math";
import type { MathCall } from "../types";
import type { PacketPart } from "./packet";
import { BASELINE_SYSTEM, CHIRON_SYSTEM } from "./prompts";
import { freshRetryState, reviewRespond } from "./review";
import type { RespondPayload } from "./schema";
import { MATH_TOOL_SPECS, RESPOND_SPEC } from "./tools";
import { TutorError, type BaselineHistoryItem, type ChironOptions, type ChironResult, type Tutor } from "./types";

// Alias that tracks Google's current Flash model, so it doesn't go stale.
// Set LLM_MODEL=gemini-pro-latest for slower, more careful answers.
export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";
const MAX_ITERATIONS = 8;

// LLM_EFFORT=low|medium|high maps to Gemini thinking levels; unset keeps the model default.
const THINKING: Record<string, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };
const thinkingLevel = THINKING[process.env.LLM_EFFORT?.trim().toLowerCase() ?? ""];

const DECLARATIONS: FunctionDeclaration[] = [...MATH_TOOL_SPECS, RESPOND_SPEC].map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.schema,
}));

function toParts(parts: PacketPart[]): Part[] {
  return parts.map((p) => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mediaType, data: p.base64 } }));
}

export class GeminiTutor implements Tutor {
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async generate(contents: Content[], system: string, withTools: boolean): Promise<GenerateContentResponse> {
    let res: GenerateContentResponse;
    try {
      res = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: system,
          ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
          ...(withTools
            ? {
                tools: [{ functionDeclarations: DECLARATIONS }],
                // Every turn must be a function call, so the turn always ends in `respond`.
                toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
              }
            : {}),
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) {
          throw new TutorError("Google rejected the API key in .env.local (LLM_API_KEY).", "auth");
        }
        if (err.status === 404) throw new TutorError(`Gemini model "${this.model}" isn't available to this key. Set LLM_MODEL in .env.local.`, "api");
        if (err.status === 429) throw new TutorError("Rate limited by the Gemini API — wait a moment and ask again.", "rate_limit");
        throw new TutorError(`Gemini API error ${err.status}: ${err.message.slice(0, 300)}`, "api");
      }
      if (err instanceof TypeError) throw new TutorError("Couldn't reach the Gemini API. Check your connection.", "network");
      throw err;
    }
    if (res.promptFeedback?.blockReason || res.candidates?.[0]?.finishReason === "SAFETY") {
      throw new TutorError("The model declined to answer this one. Try rephrasing.", "refusal");
    }
    return res;
  }

  async chiron(parts: PacketPart[], opts: ChironOptions): Promise<ChironResult> {
    const contents: Content[] = [{ role: "user", parts: toParts(parts) }];
    const mathCalls: MathCall[] = [];
    const retried = freshRetryState();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await this.generate(contents, CHIRON_SYSTEM, true);
      const content = res.candidates?.[0]?.content;
      const calls = res.functionCalls ?? [];
      if (!content || calls.length === 0) {
        // Forced function calling makes this rare; nudge once, then give up cleanly.
        if (!retried.protocol) {
          retried.protocol = true;
          if (content) contents.push(content);
          contents.push({ role: "user", parts: [{ text: "Call the respond tool with your note in `response`." }] });
          continue;
        }
        throw new TutorError("The tutor returned an empty answer.", "invalid_output");
      }
      // Echo the model's turn back unchanged: it carries Gemini's thought signatures.
      contents.push(content);

      const responses: Part[] = [];
      let accepted: RespondPayload | null = null;
      for (const call of calls) {
        const name = call.name ?? "";
        const reply = (response: Record<string, unknown>) => responses.push({ functionResponse: { id: call.id, name, response } });
        if (isMathTool(name)) {
          const { ok, output } = runMathTool(name, call.args ?? {});
          mathCalls.push({ tool: name, input: call.args ?? {}, output, ok });
          reply(ok ? { output } : { error: output });
        } else if (name === "respond") {
          const review = reviewRespond(call.args ?? {}, mathCalls, opts, retried);
          if (review.kind === "accept") accepted = review.payload;
          else reply({ error: review.message });
        } else {
          reply({ error: `unknown tool ${name}` });
        }
      }

      if (accepted) return { payload: accepted, mathCalls, retries: i };
      contents.push({ role: "user", parts: responses });
    }
    throw new TutorError("The tutor took too many steps without answering. Try asking again.", "invalid_output");
  }

  async baseline(history: BaselineHistoryItem[], parts: PacketPart[]): Promise<{ text: string }> {
    const contents: Content[] = [];
    for (const h of history.slice(-10)) {
      contents.push({ role: "user", parts: [{ text: h.question }] });
      contents.push({ role: "model", parts: [{ text: h.response }] });
    }
    contents.push({ role: "user", parts: toParts(parts) });
    const text = (await this.generate(contents, BASELINE_SYSTEM, false)).text?.trim();
    if (!text) throw new TutorError("The tutor returned an empty answer.", "invalid_output");
    return { text };
  }
}
