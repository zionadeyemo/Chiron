import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const blob = /^d_[a-z0-9]{12}$/.test(id) ? await db().getBlob(`${id}/original`) : null;
  if (!blob) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: { "Content-Type": blob.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
