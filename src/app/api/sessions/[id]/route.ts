import { z } from "zod";
import { handle } from "@/lib/http";
import { getBundle, patchSession } from "@/lib/session";

const Patch = z.object({
  location: z.object({ documentId: z.string(), page: z.number().int().min(1) }).optional(),
  task: z
    .object({
      label: z.string().min(1),
      text: z.string().optional(),
      documentId: z.string().optional(),
      page: z.number().int().min(1).optional(),
    })
    .optional(),
  step: z.string().optional(),
  closeSideQuestion: z.boolean().optional(),
  addDocument: z.string().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  return handle(() => getBundle(id));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => patchSession(id, Patch.parse(await req.json())));
}
