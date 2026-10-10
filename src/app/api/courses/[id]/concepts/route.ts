import { z } from "zod";
import { handle } from "@/lib/http";
import { editConcept, getView, setDepthStyle } from "@/lib/workspace";

const Body = z.union([
  z.object({ sessionId: z.string().min(1), concept: z.string().min(1).max(60), state: z.enum(["known", "learning", "uncertain"]).nullable() }),
  z.object({ sessionId: z.string().min(1), depthStyle: z.enum(["hints", "steps", "full"]) }),
]);

/** Corrections to "What Chiron assumes": a concept's state, or the preferred explanation depth. */
export async function POST(req: Request, ctx: RouteContext<"/api/courses/[id]/concepts">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    if ("depthStyle" in body) await setDepthStyle(body.depthStyle);
    else await editConcept(id, body.sessionId, body.concept, body.state);
    return getView(id, body.sessionId);
  });
}
