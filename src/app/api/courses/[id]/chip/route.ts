import { z } from "zod";
import { handle } from "@/lib/http";
import { getView, resolveChip } from "@/lib/workspace";

export const maxDuration = 120;

const Body = z.object({ sessionId: z.string().min(1), messageId: z.string().min(1), answer: z.enum(["yes", "no"]) });

/** The answer to "Start this as a new problem?": yes, or no (it is a question). */
export async function POST(req: Request, ctx: RouteContext<"/api/courses/[id]/chip">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    await resolveChip(id, body.sessionId, body.messageId, body.answer);
    return getView(id, body.sessionId);
  });
}
