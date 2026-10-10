import { handle } from "@/lib/http";
import { getView, startOrResumeVisit } from "@/lib/workspace";

/** Open the course workspace: starts a visit, or resumes one from the last 30 minutes. */
export async function POST(_req: Request, ctx: RouteContext<"/api/courses/[id]/open">) {
  const { id } = await ctx.params;
  return handle(async () => getView(id, await startOrResumeVisit(id)));
}
