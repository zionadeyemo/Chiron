import { z } from "zod";
import { handle } from "@/lib/http";
import { editConcept, setDepthStyle } from "@/lib/session";

const Body = z.union([
  z.object({ concept: z.string().min(1).max(60), state: z.enum(["known", "learning", "uncertain"]).nullable() }),
  z.object({ depthStyle: z.enum(["hints", "steps", "full"]) }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/concepts">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    return "depthStyle" in body ? setDepthStyle(id, body.depthStyle) : editConcept(id, body.concept, body.state);
  });
}
