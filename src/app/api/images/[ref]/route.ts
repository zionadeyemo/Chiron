import { db } from "@/lib/db";

/** The visitor's own uploaded image: a ≤10-minute signed URL on Supabase, streamed from disk locally. */
export async function GET(_req: Request, ctx: RouteContext<"/api/images/[ref]">) {
  const { ref } = await ctx.params;
  if (!/^img_[a-z0-9]{12}$/.test(ref)) return new Response("not found", { status: 404 });
  const signed = await db().signedDownloadUrl(`${ref}/original`, 600);
  if (signed) return Response.redirect(signed, 302);
  const blob = await db().getBlob(`${ref}/original`);
  if (!blob) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), { headers: { "Content-Type": blob.contentType, "Cache-Control": "private, max-age=86400" } });
}
