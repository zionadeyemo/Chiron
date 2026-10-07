import type { MathCall } from "../types";
import type { PacketPart } from "./packet";
import type { RespondPayload } from "./schema";

export interface ChironOptions {
  targetLevel: number;
  maxWords: number;
  explainMore: boolean;
}

export interface ChironResult {
  payload: RespondPayload;
  mathCalls: MathCall[];
  retries: number;
  mock?: boolean;
}

export interface BaselineHistoryItem {
  question: string;
  response: string;
}

/** The one server-side LLM boundary. Swap providers by implementing this. */
export interface Tutor {
  chiron(parts: PacketPart[], opts: ChironOptions): Promise<ChironResult>;
  baseline(history: BaselineHistoryItem[], parts: PacketPart[]): Promise<{ text: string; mock?: boolean }>;
}

export type TutorErrorCode = "no_key" | "auth" | "rate_limit" | "api" | "network" | "refusal" | "invalid_output";

export class TutorError extends Error {
  constructor(
    message: string,
    public code: TutorErrorCode,
  ) {
    super(message);
  }
}
