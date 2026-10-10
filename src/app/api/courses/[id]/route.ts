import { z } from "zod";
import { handle } from "@/lib/http";
import { getView, updateCourse } from "@/lib/workspace";

/** Refresh the workspace view (no side effects). ?sessionId=… comes from /open. */
export async function GET(req: Request, ctx: RouteContext<"/api/courses/[id]">) {
  const { id } = await ctx.params;
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  return handle(() => getView(id, sessionId));
}

const Patch = z.object({
  sessionId: z.string().default(""),
  name: z.string().min(1).max(120).optional(),
  archived: z.boolean().optional(),
  personalize: z.boolean().optional(),
});

/** Rename, archive/unarchive, or turn personalization on/off. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/courses/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const { sessionId, ...patch } = Patch.parse(await req.json());
    const course = await updateCourse(id, sessionId, patch);
    return sessionId ? getView(id, sessionId) : { course };
  });
}
