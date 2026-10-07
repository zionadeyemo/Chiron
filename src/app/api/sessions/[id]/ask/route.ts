import { z } from "zod";
import { handle } from "@/lib/http";
import { ask } from "@/lib/session";

const Body = z.object({
  question: z.string().default(""),
  pointingAt: z.string().optional(),
  explainMoreOf: z.string().optional(),
});

export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/ask">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    if (!body.explainMoreOf && !body.question.trim()) throw new z.ZodError([]);
    return ask(id, body);
  });
}
