import "server-only";
import { styleToScore } from "./depth";
import { normConcept } from "./learner";
import { getProfile, saveProfile } from "./store";
import type { DepthStyle, KnowledgeState, UserProfile } from "./types";

/** The single local student (no auth in V0). The demo uses its own profile. */
export const ME = "me";

export interface ProfileInput {
  major: string;
  year: string;
  course: string;
  previousCourses: string;
  comfortableWith: string;
  style: DepthStyle;
}

const splitList = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export async function upsertMyProfile(input: ProfileInput): Promise<UserProfile> {
  const existing = await getProfile(ME);
  const now = new Date().toISOString();
  const knowledge: KnowledgeState = { ...(existing?.knowledge ?? {}) };
  // Previous courses are profile-level evidence; things the student says they are
  // comfortable with are their own claim, which outranks anything the model infers.
  for (const c of splitList(input.previousCourses)) {
    const name = normConcept(c);
    if (!knowledge[name]) knowledge[name] = { state: "known", source: "profile", updatedAt: now };
  }
  for (const c of splitList(input.comfortableWith)) {
    knowledge[normConcept(c)] = { state: "known", source: "student", updatedAt: now };
  }
  const keepDepth = existing && existing.depth.style === input.style;
  const profile: UserProfile = {
    id: ME,
    major: input.major.trim(),
    year: input.year.trim(),
    course: input.course.trim(),
    previousCourses: splitList(input.previousCourses),
    comfortableWith: input.comfortableWith.trim(),
    depth: keepDepth ? existing.depth : { style: input.style, score: styleToScore(input.style) },
    knowledge,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await saveProfile(profile);
  return profile;
}
