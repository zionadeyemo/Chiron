import { z } from "zod";
import { handle } from "@/lib/http";
import { NotFoundError } from "@/lib/session";
import { getDocument, readDocumentFile, writeDocumentFile } from "@/lib/store";

// The browser renders PDF pages with pdf.js and stores the PNG + extracted text here,
// so the tutor can send the current page image to the vision model.

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
    return { cached: !!(await readDocumentFile(id, `page-${n}.png`)) };
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/documents/[id]/pages/[page]">) {
  return handle(async () => {
    const { id, n } = await parse(ctx);
    const { image, text } = Body.parse(await req.json());
    await writeDocumentFile(id, `page-${n}.png`, Buffer.from(image.slice(image.indexOf(",") + 1), "base64"));
    await writeDocumentFile(id, `page-${n}.txt`, text);
    return { ok: true };
  });
}
