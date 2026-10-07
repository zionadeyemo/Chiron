import { z } from "zod";
import { handle } from "@/lib/http";
import { NotFoundError } from "@/lib/session";
import { getDocument, updateDocument } from "@/lib/store";

const Patch = z.object({
  pageCount: z.number().int().min(1).max(5000).optional(),
  pageLabels: z.array(z.string().max(20)).max(5000).optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const document = await getDocument(id);
    if (!document) throw new NotFoundError("document not found");
    return { document };
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => {
    const patch = Patch.parse(await req.json());
    if (!(await getDocument(id))) throw new NotFoundError("document not found");
    return { document: await updateDocument(id, (d) => ({ ...d, ...patch })) };
  });
}
