export const dynamic = "force-dynamic";

import { tutorStatus } from "@/lib/tutor";

export async function GET() {
  return Response.json(tutorStatus());
}
