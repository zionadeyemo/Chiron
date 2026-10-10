import { z } from "zod";
import { handle } from "@/lib/http";
import { attachDocument, getView } from "@/lib/workspace";

const Body = z.object({ sessionId: z.string().min(1), documentId: z.string().min(1) });

/** Add an uploaded PDF to the course material. */
export async function POST(req: Request, ctx: RouteContext<"/api/courses/[id]/documents">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = Body.parse(await req.json());
    await attachDocument(id, body.documentId);
    return getView(id, body.sessionId);
  });
}
