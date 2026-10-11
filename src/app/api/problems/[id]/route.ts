import { z } from "zod";
import { handle } from "@/lib/http";
import { editStatement, getView, loadProblemState } from "@/lib/workspace";
import { spendLlmRequest } from "@/lib/rate-limit";

// 300 s is the most Vercel allows on Hobby (and the default on Pro) with Fluid compute.
export const maxDuration = 300;

const Body = z.object({ sessionId: z.string().min(1), statement: z.string().min(1).max(8000) });

/** Fix a misread statement. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/problems/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    await spendLlmRequest();
    const { problem } = await loadProblemState(id);
    await editStatement(id, body.statement, body.sessionId);
    return getView(problem.courseId, body.sessionId);
  });
}
