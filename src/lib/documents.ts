import "server-only";
import { db } from "./db";
import { DEMO_DOCUMENT_ID, DEMO_PAGES } from "./demo/chapter7";
import type { ImageMediaType, Part } from "./llm/types";
import type { DocumentMeta } from "./types";

// Course material (the demo chapter or uploaded PDFs) and uploaded images, as model input.
// Blob keys: "doc_<id>/original", "doc_<id>/page-<n>.png", "doc_<id>/page-<n>.txt", "<imageRef>/original".

export const getDocument = (id: string) => db().get<DocumentMeta>("documents", id);

export async function pageLabel(docId: string, page: number) {
  const doc = await getDocument(docId);
  const printed = doc?.pageLabels?.[page - 1];
  return printed ? `p. ${printed}` : `page ${page}`;
}

/** The page as the model sees it: image (if rendered) plus text as a supplement. */
export async function pageParts(docId: string, page: number): Promise<Part[]> {
  const doc = await getDocument(docId);
  const label = await pageLabel(docId, page);
  const parts: Part[] = [{ type: "text", text: `<page document="${doc?.title ?? "material"}" page="${label}">` }];
  if (docId === DEMO_DOCUMENT_ID) {
    const p = DEMO_PAGES[page - 1];
    if (p) parts.push({ type: "text", text: p.markdown.replace(/^\[\[fig:\w+\]\]$/gm, "").trim() + (p.figures ? `\n[Figure description] ${p.figures}` : "") });
  } else {
    const [img, txt] = await Promise.all([db().getBlob(`${docId}/page-${page}.png`), db().getBlob(`${docId}/page-${page}.txt`)]);
    if (img) parts.push({ type: "image", mediaType: img.contentType === "image/jpeg" ? "image/jpeg" : "image/png", base64: img.data.toString("base64") });
    const text = txt?.data.toString("utf8").trim();
    if (text) parts.push({ type: "text", text: `Extracted text (may be garbled; trust the image for equations):\n${text.slice(0, 12000)}` });
  }
  parts.push({ type: "text", text: "</page>" });
  return parts;
}

const IMAGE_TYPES: ImageMediaType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function imagePart(ref: string): Promise<Part | null> {
  const blob = await db().getBlob(`${ref}/original`);
  if (!blob) return null;
  const mediaType = IMAGE_TYPES.find((t) => t === blob.contentType) ?? "image/png";
  return { type: "image", mediaType, base64: blob.data.toString("base64") };
}

export async function imageParts(refs: string[]): Promise<Part[]> {
  return (await Promise.all(refs.map(imagePart))).filter((p): p is Part => !!p);
}
