import { z } from "zod";
import { db, newId } from "@/lib/db";
import { handle } from "@/lib/http";

// Direct uploads (Vercel): the server picks the object's key under this visitor's prefix and signs
// an upload URL for exactly that key, so the file never passes through a function body (Vercel caps
// those at 4.5 MB). With local files there's no URL and the browser uses the multipart routes.

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MB = 1024 * 1024;

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    contentType: z.enum(IMAGE_TYPES as [string, ...string[]]),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * MB),
  }),
  z.object({
    kind: z.literal("pdf"),
    size: z
      .number()
      .int()
      .positive()
      .max(60 * MB),
  }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    const id = newId(body.kind === "image" ? "img_" : "d_");
    const uploadUrl = await db().signedUploadUrl(`${id}/original`);
    return { id, uploadUrl };
  });
}
