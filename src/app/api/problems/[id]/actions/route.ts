import { z } from "zod";
import { applyAction, BoardAction } from "@/lib/board/actions";
import { handle } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ sessionId: z.string().min(1), action: BoardAction });

/** Whiteboard actions: Hint, Next step, I got it, clicking a step, and the rest. */
export async function POST(req: Request, ctx: RouteContext<"/api/problems/[id]/actions">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    return applyAction(id, body.sessionId, body.action);
  });
}
