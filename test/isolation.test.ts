import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, NotFoundError, useBackend } from "@/lib/db";
import { FileStore } from "@/lib/db/file";
import { SupabaseDocStore } from "@/lib/db/supabase";
import { getDocument } from "@/lib/documents";
import { runAsVisitor } from "@/lib/visitor";
import { attachDocument, createCourse, getView, listCourses, sendMessage, startOrResumeVisit } from "@/lib/workspace";
import { fakeSupabase } from "./fake-supabase";

// Two simulated visitors through the real workspace code (mock LLM): A creates a course, a session,
// a document and a conversation; B sees none of it and gets "not found" for every A id.

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const dir = mkdtempSync(path.join(tmpdir(), "chiron-iso-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const fake = fakeSupabase();

describe.each([
  ["file store", () => useBackend((v) => new FileStore(dir, v))],
  ["supabase store (mocked client)", () => useBackend((v) => new SupabaseDocStore(fake.client, "chiron-files", v))],
])("visitor isolation — %s", (_name, install) => {
  beforeAll(install);
  const ids = {
    course: "",
    session: "",
    doc: "d_aaaaaaaaaaaa",
    image: "img_aaaaaaaaaaaa",
  };

  it("A creates a course, session, document and conversation", () =>
    runAsVisitor(A, async () => {
      await db().putBlob(`${ids.doc}/original`, Buffer.from("%PDF-1.4"), "application/pdf");
      await db().put("documents", ids.doc, {
        id: ids.doc,
        kind: "pdf",
        title: "A's notes",
        pageCount: 1,
        createdAt: new Date().toISOString(),
      });
      await db().putBlob(`${ids.image}/original`, Buffer.from("png"), "image/png");
      const course = await createCourse("A's statics");
      ids.course = course.id;
      await attachDocument(course.id, ids.doc);
      ids.session = await startOrResumeVisit(course.id);
      await sendMessage(course.id, {
        sessionId: ids.session,
        text: "What is a moment?",
        imageRefs: [],
        mode: "normal",
      });
      const view = await getView(course.id, ids.session);
      expect(view.messages.length).toBeGreaterThan(0);
      expect(view.documents.map((d) => d.id)).toEqual([ids.doc]);
    }));

  it("B lists none of it and gets not-found for A's ids", () =>
    runAsVisitor(B, async () => {
      const mine = await listCourses(); // a new visitor: only their own seeded demo
      expect(mine.map((c) => c.course.id)).not.toContain(ids.course);
      expect(JSON.stringify(mine)).not.toContain("A's statics");
      await expect(getView(ids.course, ids.session)).rejects.toBeInstanceOf(NotFoundError);
      await expect(startOrResumeVisit(ids.course)).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        sendMessage(ids.course, {
          sessionId: ids.session,
          text: "hi",
          imageRefs: [],
          mode: "normal",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await getDocument(ids.doc)).toBeNull();
      expect(await db().getBlob(`${ids.doc}/original`)).toBeNull();
      expect(await db().getBlob(`${ids.image}/original`)).toBeNull();
      expect(await db().signedDownloadUrl(`${ids.image}/original`, 600)).toBeNull();
      // Attaching A's document to B's own course doesn't work either.
      await expect(attachDocument(mine[0].course.id, ids.doc)).rejects.toBeInstanceOf(NotFoundError);
    }));

  it("A still has everything", () =>
    runAsVisitor(A, async () => {
      const view = await getView(ids.course, ids.session);
      expect(view.course.name).toBe("A's statics");
      expect((await db().getBlob(`${ids.image}/original`))?.contentType).toBe("image/png");
    }));

  it("a new visitor gets the demo course, without an LLM call or a fictional learner", () =>
    runAsVisitor(B, async () => {
      const courses = await listCourses();
      expect(courses.map((c) => c.course.name)).toEqual(["AE 3120 — Structural Mechanics"]);
      const profile = await db().get<{ major: string }>("profiles", "me");
      expect(profile?.major).toBe("");
    }));
});
