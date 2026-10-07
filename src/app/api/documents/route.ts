import { handle } from "@/lib/http";
import { newId, saveDocument, writeDocumentFile } from "@/lib/store";
import type { DocumentMeta } from "@/lib/types";

const MAX_BYTES = 60 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Upload a PDF or a screenshot (multipart field "file"). */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("no file");
    if (file.size > MAX_BYTES) throw new Error("file too large (60 MB max)");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = IMAGE_TYPES.includes(file.type);
    if (!isPdf && !isImage) throw new Error("upload a PDF or an image");

    const id = newId("d_");
    await writeDocumentFile(id, "original", Buffer.from(await file.arrayBuffer()));
    const meta: DocumentMeta = {
      id,
      kind: isPdf ? "pdf" : "screenshot",
      title: isPdf ? file.name.replace(/\.pdf$/i, "") : "Pasted screenshot",
      pageCount: isPdf ? 0 : 1, // a PDF's page count is reported once pdf.js has opened it
      mimeType: isPdf ? "application/pdf" : file.type,
      createdAt: new Date().toISOString(),
    };
    await saveDocument(meta);
    return { document: meta };
  });
}
