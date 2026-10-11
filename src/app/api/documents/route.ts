import { z } from "zod";
import { db, newId, NotFoundError } from "@/lib/db";
import { handle } from "@/lib/http";
import type { DocumentMeta } from "@/lib/types";

// Two ways in: multipart (local files) or, after a direct upload to storage, JSON naming the
// document id that /api/uploads/sign issued. Pages are rendered in the browser by pdf.js.
const MAX_BYTES = 60 * 1024 * 1024;

const Uploaded = z.object({
  id: z.string().regex(/^d_[a-z0-9]{12}$/),
  name: z.string().min(1).max(200),
});

async function record(id: string, name: string) {
  const meta: DocumentMeta = {
    id,
    kind: "pdf",
    title: name.replace(/\.pdf$/i, ""),
    pageCount: 0, // reported once pdf.js has opened it
    mimeType: "application/pdf",
    createdAt: new Date().toISOString(),
  };
  await db().put("documents", id, meta);
  return { document: meta };
}

export async function POST(req: Request) {
  return handle(async () => {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const { id, name } = Uploaded.parse(await req.json());
      // Only this visitor's own uploaded file counts; a guessed id under someone else's prefix doesn't exist here.
      if (!(await db().hasBlob(`${id}/original`))) throw new NotFoundError("upload not found");
      if (await db().get("documents", id)) throw new Error("document already recorded");
      return record(id, name);
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("no file");
    if (file.size > MAX_BYTES) throw new Error("file too large (60 MB max)");
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) throw new Error("upload a PDF");
    const id = newId("d_");
    await db().putBlob(`${id}/original`, Buffer.from(await file.arrayBuffer()), "application/pdf");
    return record(id, file.name);
  });
}
