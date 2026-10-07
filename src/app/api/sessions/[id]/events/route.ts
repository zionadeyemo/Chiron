import { readEvents } from "@/lib/store";

/** Raw event log as JSONL, for analysis outside the app. */
export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]/events">) {
  const { id } = await ctx.params;
  try {
    const events = await readEvents(id);
    return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
      headers: { "Content-Type": "application/x-ndjson", "Content-Disposition": `attachment; filename="chiron-${id}.jsonl"` },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
