import "server-only";
import { DEMO_DOCUMENT_ID, DEMO_PAGES } from "../demo/chapter7";
import { conceptsByState } from "../learner";
import { getDocument, readDocumentFile } from "../store";
import type { DepthTarget } from "../depth";
import { UNMARKED_TASK, type DocumentMeta, type StudySession, type Turn, type UserProfile } from "../types";

// A provider-neutral context packet. The tutor implementation maps parts to its API.

export type PacketPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string };

export interface PageContent {
  label: string; // printed label if known, else "page N"
  position: string; // "page 2 of 5"
  text?: string;
  image?: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string };
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const asImageType = (m?: string): ImageType => (IMAGE_TYPES as readonly string[]).includes(m ?? "") ? (m as ImageType) : "image/png";

export async function loadPage(documentId: string, page: number): Promise<{ doc: DocumentMeta | null; content: PageContent }> {
  const doc = await getDocument(documentId);
  const label = doc?.pageLabels?.[page - 1] ? `p. ${doc.pageLabels[page - 1]}` : `page ${page}`;
  const position = `page ${page} of ${doc?.pageCount ?? "?"}`;
  const content: PageContent = { label, position };

  if (documentId === DEMO_DOCUMENT_ID) {
    const p = DEMO_PAGES[page - 1];
    if (p) content.text = p.markdown.replace(/^\[\[fig:\w+\]\]$/gm, "").trim() + (p.figures ? `\n\n[Figure description] ${p.figures}` : "");
    return { doc, content };
  }
  if (doc?.kind === "screenshot") {
    const img = await readDocumentFile(documentId, "original");
    if (img) content.image = { mediaType: asImageType(doc.mimeType), base64: img.toString("base64") };
    return { doc, content };
  }
  const [img, txt] = await Promise.all([
    readDocumentFile(documentId, `page-${page}.png`),
    readDocumentFile(documentId, `page-${page}.txt`),
  ]);
  if (img) content.image = { mediaType: "image/png", base64: img.toString("base64") };
  const text = txt?.toString("utf8").trim();
  if (text) content.text = text;
  return { doc, content };
}

function pageParts(tag: string, docTitle: string, page: PageContent, note: string): PacketPart[] {
  const parts: PacketPart[] = [
    { type: "text", text: `<${tag} document="${docTitle}" page="${page.label}" position="${page.position}">${note}` },
  ];
  if (page.image) parts.push({ type: "image", mediaType: page.image.mediaType, base64: page.image.base64 });
  if (page.text) {
    const label = page.image ? "Extracted text (supplement — may be garbled; trust the image for equations and figures)" : "Page text";
    parts.push({ type: "text", text: `${label}:\n${page.text.slice(0, 12000)}` });
  }
  if (!page.image && !page.text) parts.push({ type: "text", text: "(page content unavailable)" });
  parts.push({ type: "text", text: `</${tag}>` });
  return parts;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function recentTurns(turns: Turn[], n = 4): string {
  const recent = turns.slice(-n);
  if (!recent.length) return "(none yet — this is the first question of the session)";
  return recent
    .map((t) => {
      const q = t.kind === "explain_more" ? `[pressed Explain more]` : t.question;
      const tags = [`level ${t.depth ?? "?"}`, `${t.words} words`, t.feedback ? `rated: ${t.feedback.replace("_", " ")}` : null, t.inSideQuestion ? "side question" : null]
        .filter(Boolean)
        .join(", ");
      return `Student: ${truncate(q, 300)}\nChiron (${tags}): ${truncate(t.response, 500)}`;
    })
    .join("\n\n");
}

function recentFeedback(turns: Turn[]): string {
  const rated = turns.filter((t) => t.feedback).slice(-6);
  if (!rated.length) return "(no ratings yet)";
  return rated
    .map((t) => `- "${truncate(t.kind === "explain_more" ? "Explain more" : t.question, 80)}" answered at level ${t.depth}, ${t.words} words → ${t.feedback!.replace("_", " ")}`)
    .join("\n");
}

export interface PacketInput {
  session: StudySession;
  profile: UserProfile;
  target: DepthTarget;
  question: string;
  pointingAt?: string;
  explainMoreOf?: Turn;
}

export async function buildChironPacket(input: PacketInput): Promise<PacketPart[]> {
  const { session, profile, target, question, pointingAt, explainMoreOf } = input;
  const k = conceptsByState(profile.knowledge);
  const parts: PacketPart[] = [];

  parts.push({
    type: "text",
    text: [
      `<learner>`,
      `Major: ${profile.major}. Year: ${profile.year}. Current course: ${profile.course || session.course.name}.`,
      `Previous relevant courses: ${profile.previousCourses.join(", ") || "(not given)"}.`,
      profile.comfortableWith ? `Says they're comfortable with: ${profile.comfortableWith}.` : null,
      `Usually wants: ${profile.depth.style === "hints" ? "short hints" : profile.depth.style === "full" ? "full explanations" : "step-by-step help"}.`,
      `</learner>`,
      `<learner_model>`,
      `known: ${k.known.join("; ") || "(none)"}`,
      `learning: ${k.learning.join("; ") || "(none)"}`,
      `uncertain: ${k.uncertain.join("; ") || "(none)"}`,
      `</learner_model>`,
      `<course>${session.course.name}. Act as a specialist in this course who knows this student's background.</course>`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  // Current location, then the task's own page if the student has navigated away from it.
  const loc = session.location;
  const { doc, content } = await loadPage(loc.documentId, loc.page);
  parts.push(...pageParts("current_page", doc?.title ?? "material", content, "The page the student is looking at right now."));

  const t = session.task;
  if (t.documentId && t.page && (t.documentId !== loc.documentId || t.page !== loc.page)) {
    const taskPage = await loadPage(t.documentId, t.page);
    if (t.text) {
      parts.push({ type: "text", text: `<task_page page="${taskPage.content.label}">(problem statement given below)</task_page>` });
    } else {
      parts.push(...pageParts("task_page", taskPage.doc?.title ?? "material", taskPage.content, "The page where the current problem is."));
    }
  }

  parts.push({
    type: "text",
    text: [
      `<current_task label="${t.label}">`,
      t.label === UNMARKED_TASK
        ? "(The student hasn't marked a problem yet. Infer it from the page and their question; once it's clear, set taskUpdate.task to a short label like \"Problem 4.31\".)"
        : t.text
          ? t.text
          : "(problem statement not available as text — see the page image)",
      `</current_task>`,
      `<current_step>${session.step || "(not yet identified)"}</current_step>`,
      session.sideQuestion
        ? `<side_question status="open">The student stepped aside to ask: "${session.sideQuestion.question}". Parent task: ${t.label}, step: ${session.step}.</side_question>`
        : `<side_question status="none"/>`,
      `<recent_turns>\n${recentTurns(session.turns)}\n</recent_turns>`,
      `<recent_depth_feedback>\n${recentFeedback(session.turns)}\n</recent_depth_feedback>`,
      `<depth_target level="${target.level}" name="${["", "hint / direct clarification", "short explanation", "worked reasoning", "deep conceptual explanation"][target.level]}" max_words="${target.maxWords}">${target.reason}</depth_target>`,
      pointingAt ? `<pointing_at>The student has highlighted this in the material: "${truncate(pointingAt, 600)}"</pointing_at>` : null,
      explainMoreOf
        ? `<explain_more>The student pressed "Explain more" on your answer to "${explainMoreOf.kind === "explain_more" ? "(a previous Explain more)" : explainMoreOf.question}":\n"${explainMoreOf.response}"\nGo exactly one level deeper: level ${target.level}. Same confusion; build on what you said, don't repeat it.</explain_more>`
        : `<student_message>${question}</student_message>`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return parts;
}

/** Baseline: a plain tutor that sees the current page with each message, like a student re-uploading. */
export async function buildBaselineMessage(session: StudySession, question: string, pointingAt?: string): Promise<PacketPart[]> {
  const { doc, content } = await loadPage(session.location.documentId, session.location.page);
  const parts: PacketPart[] = [];
  if (content.image) parts.push({ type: "image", mediaType: content.image.mediaType, base64: content.image.base64 });
  const material = content.text ? `Here is the page I'm on (${doc?.title ?? "my material"}, ${content.label}):\n${content.text.slice(0, 12000)}\n\n` : "";
  const task = session.task.text ? `I'm working on: ${session.task.text}\n\n` : `I'm working on: ${session.task.label}\n\n`;
  const pointing = pointingAt ? `About this part: "${pointingAt}"\n\n` : "";
  parts.push({ type: "text", text: `${material}${task}${pointing}${question}` });
  return parts;
}
