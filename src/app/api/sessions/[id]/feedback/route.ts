import { z } from "zod";
import { handle } from "@/lib/http";
import { flag, rate } from "@/lib/session";

const Body = z.object({
  turnId: z.string(),
  kind: z.enum(["too_much", "just_right", "too_little", "flag"]),
});

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/feedback">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const { turnId, kind } = Body.parse(await req.json());
    return kind === "flag" ? flag(id, turnId) : rate(id, turnId, kind);
  });
}
