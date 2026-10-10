import { z } from "zod";
import { handle } from "@/lib/http";
import { getView, submitProblem } from "@/lib/workspace";

export const maxDuration = 120;

/** A problem marked in the material (PDF page), optionally with its selected text. */
const Body = z.object({
  sessionId: z.string().min(1),
  pdf: z.object({ docId: z.string().min(1), page: z.number().int().min(1) }),
  text: z.string().max(8000).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/courses/[id]/problems">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    await submitProblem(id, body.sessionId, { source: "pdf", pdf: body.pdf, text: body.text });
    return getView(id, body.sessionId);
  });
}
