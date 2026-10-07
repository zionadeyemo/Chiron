import { z } from "zod";
import { createDemoSession } from "@/lib/demo/seed";
import { logEvent } from "@/lib/events";
import { handle } from "@/lib/http";
import { NotFoundError } from "@/lib/session";
import { getDocument, getProfile, listSessions, newId, saveSession } from "@/lib/store";
import type { StudySession } from "@/lib/types";
import { ME } from "@/lib/profile";
import { UNMARKED_TASK } from "@/lib/types";

const CreateBody = z.object({
  kind: z.enum(["demo", "material"]),
  mode: z.enum(["chiron", "baseline"]).default("chiron"),
  documentId: z.string().optional(),
});



export async function POST(req: Request) {
  return handle(async () => {
    const body = CreateBody.parse(await req.json());
    let session: StudySession;
    if (body.kind === "demo") {
      session = await createDemoSession(body.mode);
    } else {
      const profile = await getProfile(ME);
      if (!profile) throw new NotFoundError("profile not set up");
      const doc = body.documentId ? await getDocument(body.documentId) : null;
      if (!doc) throw new NotFoundError("document not found");
      const now = new Date().toISOString();
      session = {
        id: newId("s_"),
        mode: body.mode,
        profileId: ME,
        course: { name: profile.course || "Coursework" },
        documentIds: [doc.id],
        location: { documentId: doc.id, page: 1 },
        task:
          doc.kind === "screenshot"
            ? { label: "Pasted problem", documentId: doc.id, page: 1, setBy: "student" }
            : { label: UNMARKED_TASK, setBy: "model" },
        step: doc.kind === "screenshot" ? "Getting started" : "",
        sideQuestion: null,
        relevantConcepts: [],
        shortenNext: null,
        turns: [],
        isDemo: false,
        startedAt: now,
        lastActiveAt: now,
      };
      await saveSession(session);
    }
    await logEvent(session, "session_start", { isDemo: session.isDemo });
    return { id: session.id };
  });
}

export async function GET() {
  return handle(async () =>
    (await listSessions()).map((s) => ({
      id: s.id,
      mode: s.mode,
      isDemo: s.isDemo,
      course: s.course.name,
      task: s.task.label,
      turns: s.turns.length,
      startedAt: s.startedAt,
      lastActiveAt: s.lastActiveAt,
    })),
  );
}
