import { db, newId } from "@/lib/db";
import { handle } from "@/lib/http";

const MAX_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** A pasted or chosen image (a problem screenshot or a photo of work). Returns its ref. */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("no file");
    if (!IMAGE_TYPES.includes(file.type)) throw new Error("images only (PNG, JPEG, WebP, GIF)");
    if (file.size > MAX_BYTES) throw new Error("image too large (4 MB max)");
    const ref = newId("img_");
    await db().putBlob(`${ref}/original`, Buffer.from(await file.arrayBuffer()), file.type);
    return { ref };
  });
}
