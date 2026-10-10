import { db, newId } from "@/lib/db";
import { handle } from "@/lib/http";
import type { DocumentMeta } from "@/lib/types";

// Local storage accepts large PDFs; on Vercel the request body limit is 4.5 MB (see DECISIONS D2).
const MAX_BYTES = 60 * 1024 * 1024;

/** Upload a PDF (multipart field "file"). Pages are rendered in the browser by pdf.js. */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("no file");
    if (file.size > MAX_BYTES) throw new Error("file too large (60 MB max)");
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) throw new Error("upload a PDF");

    const id = newId("d_");
    await db().putBlob(`${id}/original`, Buffer.from(await file.arrayBuffer()), "application/pdf");
    const meta: DocumentMeta = {
      id,
      kind: "pdf",
      title: file.name.replace(/\.pdf$/i, ""),
      pageCount: 0, // reported once pdf.js has opened it
      mimeType: "application/pdf",
      createdAt: new Date().toISOString(),
    };
    await db().put("documents", id, meta);
    return { document: meta };
  });
}
