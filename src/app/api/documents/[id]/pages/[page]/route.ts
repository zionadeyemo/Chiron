import { z } from "zod";
import { db, NotFoundError } from "@/lib/db";
import { getDocument } from "@/lib/documents";
import { handle } from "@/lib/http";

// The browser renders PDF pages with pdf.js and stores the PNG + extracted text here,
// so the model can see the page image (vision) with the text as a supplement.

const Body = z.object({
  image: z.string().startsWith("data:image/png;base64,"),
  text: z.string().max(100_000).default(""),
});

async function parse(ctx: RouteContext<"/api/documents/[id]/pages/[page]">) {
  const { id, page } = await ctx.params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) throw new NotFoundError("bad page");
  if (!(await getDocument(id))) throw new NotFoundError("document not found");
  return { id, n };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/pages/[page]">) {
  return handle(async () => {
    const { id, n } = await parse(ctx);
    return { cached: !!(await db().getBlob(`${id}/page-${n}.png`)) };
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/documents/[id]/pages/[page]">) {
  return handle(async () => {
    const { id, n } = await parse(ctx);
    const { image, text } = Body.parse(await req.json());
    await db().putBlob(`${id}/page-${n}.png`, Buffer.from(image.slice(image.indexOf(",") + 1), "base64"), "image/png");
    await db().putBlob(`${id}/page-${n}.txt`, Buffer.from(text, "utf8"), "text/plain");
    return { ok: true };
  });
}
