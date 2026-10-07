import { summarize } from "@/lib/events";
import { handle } from "@/lib/http";
import { listSessions } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Every session's summary, for the internal research index. */
export async function GET() {
  return handle(async () => {
    const sessions = await listSessions();
    return Promise.all(
      sessions.map(async (s) => ({
        id: s.id,
        task: s.task.label,
        course: s.course.name,
        isDemo: s.isDemo,
        mock: s.turns.some((t) => t.mock),
        startedAt: s.startedAt,
        summary: await summarize(s),
      })),
    );
  });
}
