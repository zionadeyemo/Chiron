import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

// Visitor isolation through the real server (proxy → cookies → scoped store), with separate
// browser contexts as separate visitors. Local runs use the file store; the Supabase store is
// covered by the same unit suite against a mocked client.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function visitorId(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === "chiron_vid")?.value;
}

async function seedA(api: APIRequestContext) {
  const course = (await (await api.post("/api/courses", { data: { name: "A's private course" } })).json()).course;
  const sessionId = (await (await api.post(`/api/courses/${course.id}/open`)).json()).sessionId;
  await api.post(`/api/courses/${course.id}/messages`, { data: { sessionId, text: "What is a moment?", imageRefs: [], mode: "normal" } });
  const image = (await (await api.post("/api/uploads", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } } })).json()).ref;
  const doc = (await (await api.post("/api/documents", { multipart: { file: { name: "notes.pdf", mimeType: "application/pdf", buffer: PDF } } })).json()).document;
  await api.post(`/api/courses/${course.id}/documents`, { data: { sessionId, documentId: doc.id } });
  return { course: course.id as string, sessionId: sessionId as string, image: image as string, doc: doc.id as string };
}

test("two visitors never see each other's courses, sessions, documents, conversations or files", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  await a.request.get("/api/status");
  const ids = await seedA(a.request);

  // A can read all of it.
  expect((await a.request.get(`/api/courses/${ids.course}?sessionId=${ids.sessionId}`)).status()).toBe(200);
  expect((await a.request.get(`/api/images/${ids.image}`)).status()).toBe(200);
  expect((await a.request.get(`/api/documents/${ids.doc}/file`)).status()).toBe(200);

  // B lists nothing of A's, and every A id is a 404.
  const listed = await (await b.request.get("/api/courses")).text();
  expect(listed).not.toContain(ids.course);
  expect(listed).not.toContain("A's private course");
  expect((await b.request.get(`/api/courses/${ids.course}?sessionId=${ids.sessionId}`)).status()).toBe(404);
  expect((await b.request.post(`/api/courses/${ids.course}/open`)).status()).toBe(404);
  expect((await b.request.post(`/api/courses/${ids.course}/messages`, { data: { sessionId: ids.sessionId, text: "hi", imageRefs: [], mode: "normal" } })).status()).toBe(404);
  expect((await b.request.get(`/api/images/${ids.image}`)).status()).toBe(404);
  expect((await b.request.get(`/api/documents/${ids.doc}`)).status()).toBe(404);
  expect((await b.request.get(`/api/documents/${ids.doc}/file`)).status()).toBe(404);
  expect((await b.request.get(`/api/documents/${ids.doc}/pages/1`)).status()).toBe(404);
  // B can't adopt A's upload as their own document either.
  expect((await b.request.post("/api/documents", { data: { id: ids.doc, name: "stolen.pdf" } })).status()).toBe(404);

  // The workspace page shows B nothing either.
  const page = await b.newPage();
  await page.goto(`/course/${ids.course}`);
  await expect(page.getByText("A's private course")).toHaveCount(0);

  await a.close();
  await b.close();
});

test("a tampered or malformed visitor cookie gets a fresh visitor and no access", async ({ browser }) => {
  const a = await browser.newContext();
  await a.request.get("/api/status");
  const ids = await seedA(a.request);
  const vid = (await visitorId(a))!;

  for (const bad of ["not-a-uuid", `${vid}x`, vid.slice(0, -1) + (vid.endsWith("0") ? "1" : "0")]) {
    const c = await browser.newContext();
    await c.addCookies([{ name: "chiron_vid", value: bad, url: "http://localhost:3100" }]);
    const res = await c.request.get(`/api/courses/${ids.course}?sessionId=${ids.sessionId}`);
    expect(res.status(), bad).toBe(404);
    const now = await visitorId(c);
    expect(now).not.toBe(vid);
    if (bad !== now) expect(now).toMatch(/^[0-9a-f-]{36}$/); // malformed → replaced with a fresh UUID
    expect(await (await c.request.get("/api/courses")).text()).not.toContain(ids.course);
    await c.close();
  }
  await a.close();
});
