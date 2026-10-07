import { z } from "zod";
import { handle } from "@/lib/http";
import { ME, upsertMyProfile } from "@/lib/profile";
import { getProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  major: z.string().max(100).default(""),
  year: z.string().max(40).default(""),
  course: z.string().max(120).default(""),
  previousCourses: z.string().max(1000).default(""),
  comfortableWith: z.string().max(1000).default(""),
  style: z.enum(["hints", "steps", "full"]).default("steps"),
});

export async function GET() {
  return handle(async () => ({ profile: await getProfile(ME) }));
}

export async function PUT(req: Request) {
  return handle(async () => ({ profile: await upsertMyProfile(Body.parse(await req.json())) }));
}
