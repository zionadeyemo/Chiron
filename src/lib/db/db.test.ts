import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, NotFoundError, useDataDir } from ".";

describe("file document store", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chiron-db-"));
  beforeAll(() => useDataDir(dir));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("puts, gets, updates and lists documents", async () => {
    await db().put("courses", "c_one", { id: "c_one", n: 1 });
    await db().put("courses", "c_two", { id: "c_two", n: 2 });
    expect(await db().get("courses", "c_one")).toEqual({ id: "c_one", n: 1 });
    await db().update<{ n: number }>("courses", "c_one", (c) => {
      c.n = 5;
    });
    expect(await db().get("courses", "c_one")).toEqual({ id: "c_one", n: 5 });
    const big = await db().list<{ n: number }>("courses", (c) => c.n > 1);
    expect(big.map((c) => c.n).sort()).toEqual([2, 5]);
  });

  it("never lets a reader see a half-written document", async () => {
    const big = { id: "v_torn", lines: Array.from({ length: 2000 }, (_, i) => `line ${i}`) };
    await db().put("visits", "v_torn", big);
    const writes = Array.from({ length: 15 }, (_, i) => db().put("visits", "v_torn", { ...big, n: i }));
    const reads = Array.from({ length: 60 }, () => db().get<typeof big>("visits", "v_torn"));
    const seen = await Promise.all(reads);
    await Promise.all(writes);
    for (const doc of seen) expect(doc?.lines).toHaveLength(2000);
  });

  it("serialises concurrent updates to the same document", async () => {
    await db().put("boards", "b_race", { count: 0 });
    await Promise.all(
      Array.from({ length: 20 }, () =>
        db().update<{ count: number }>("boards", "b_race", (b) => {
          b.count++;
        }),
      ),
    );
    expect(await db().get("boards", "b_race")).toEqual({ count: 20 });
  });

  it("supports ids with a colon (course-level threads)", async () => {
    await db().put("threads", "course:c_one", { ok: true });
    expect(await db().get("threads", "course:c_one")).toEqual({ ok: true });
  });

  it("rejects unsafe ids and blob keys", async () => {
    await expect(db().get("courses", "../etc")).rejects.toThrow();
    await expect(db().putBlob("../x", Buffer.from(""), "text/plain")).rejects.toThrow();
  });

  it("throws NotFoundError when updating a missing document", async () => {
    await expect(db().update("courses", "c_missing", () => undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("stores blobs and appends events", async () => {
    await db().putBlob("img_abc/original", Buffer.from("png"), "image/png");
    expect((await db().getBlob("img_abc/original"))?.contentType).toBe("image/png");
    await db().appendEvent("c_one", { type: "a" });
    await db().appendEvent("c_one", { type: "b" });
    expect((await db().readEvents("c_one")).map((e) => e.type)).toEqual(["a", "b"]);
  });
});
