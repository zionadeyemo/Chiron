import { z } from "zod";
import { createDemoCourse } from "@/lib/demo/seed";
import { handle } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ mode: z.enum(["chiron", "baseline"]).default("chiron") });

/** A fresh demo course with Problem 7.18 already submitted. */
export async function POST(req: Request) {
  return handle(async () => {
    const { mode } = Body.parse(await req.json().catch(() => ({})));
    return { courseId: await createDemoCourse(mode) };
  });
}
