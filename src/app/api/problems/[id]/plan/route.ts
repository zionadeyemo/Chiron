import { z } from "zod";
import { ensurePlan } from "@/lib/board/actions";
import { handle } from "@/lib/http";

// Planning a whole solution with the strong model can take a minute or two.
export const maxDuration = 300;

const Body = z.object({ sessionId: z.string().min(1) });

/** Plan the problem (or wait for a plan in progress). Idempotent; also retries a failed plan. */
export async function POST(req: Request, ctx: RouteContext<"/api/problems/[id]/plan">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const { sessionId } = Body.parse(await req.json());
    return ensurePlan(id, sessionId);
  });
}
