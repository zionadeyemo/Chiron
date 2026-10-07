import { getDocument, readDocumentFile } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const doc = await getDocument(id).catch(() => null);
  const bytes = doc ? await readDocumentFile(id, "original") : null;
  if (!doc || !bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": doc.mimeType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
