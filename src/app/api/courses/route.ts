import { z } from "zod";
import { handle } from "@/lib/http";
import { createCourse, listCourses } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1).max(120), mode: z.enum(["chiron", "baseline"]).default("chiron") });

export async function GET() {
  return handle(() => listCourses());
}

export async function POST(req: Request) {
  return handle(async () => {
    const { name, mode } = Body.parse(await req.json());
    return { course: await createCourse(name, mode) };
  });
}
