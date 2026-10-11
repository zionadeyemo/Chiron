import { z } from "zod";
import { applyAction, BoardAction } from "@/lib/board/actions";
import { handle } from "@/lib/http";
import { spendLlmRequest } from "@/lib/rate-limit";

// 300 s is the most Vercel allows on Hobby (and the default on Pro) with Fluid compute.
export const maxDuration = 300;

const Body = z.object({ sessionId: z.string().min(1), action: BoardAction });

/** Whiteboard actions: Hint, Next step, I got it, clicking a step, and the rest. */
export async function POST(req: Request, ctx: RouteContext<"/api/problems/[id]/actions">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    // Only these actions call the model; Hint / Next step / I got it are free.
    if (body.action.type === "answer_check" || body.action.type === "too_big") await spendLlmRequest();
    return applyAction(id, body.sessionId, body.action);
  });
}
