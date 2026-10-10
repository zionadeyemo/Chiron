import { z } from "zod";
import { handle } from "@/lib/http";
import { getView, selectProblem } from "@/lib/workspace";

const Body = z.object({ sessionId: z.string().min(1), problemId: z.string().min(1) });

/** Reopen an earlier problem: its whiteboard comes back exactly as it was left. */
export async function POST(req: Request, ctx: RouteContext<"/api/courses/[id]/select">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    await selectProblem(id, body.problemId);
    return getView(id, body.sessionId);
  });
}
