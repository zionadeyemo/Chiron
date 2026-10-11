import { z } from "zod";
import { handle } from "@/lib/http";
import { getView, sendMessage } from "@/lib/workspace";
import { spendLlmRequest } from "@/lib/rate-limit";

// 300 s is the most Vercel allows on Hobby (and the default on Pro) with Fluid compute.
export const maxDuration = 300;

const Body = z.object({
  sessionId: z.string().min(1),
  text: z.string().max(8000).default(""),
  imageRefs: z.array(z.string().regex(/^img_[a-z0-9]{12}$/)).max(4).default([]),
  mode: z.enum(["normal", "new_problem", "my_work"]).default("normal"),
  explainMoreOf: z.string().optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/courses/[id]/messages">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    await spendLlmRequest();
    if (!body.explainMoreOf && !body.text.trim() && !body.imageRefs.length) throw new z.ZodError([]);
    await sendMessage(id, body);
    return getView(id, body.sessionId);
  });
}
