import { summarize } from "@/lib/events";
import { handle } from "@/lib/http";
import { getBundle } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]/summary">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const bundle = await getBundle(id);
    return { summary: await summarize(bundle.session), ...bundle };
  });
}
