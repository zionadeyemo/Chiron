import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeSupabase } from "../../../test/fake-supabase";
import { runAsVisitor } from "../visitor";
import { db, NotFoundError, storageConfig, StorageConfigError, useBackend } from ".";
import { FileStore } from "./file";
import { SupabaseDocStore } from "./supabase";

// One suite, two stores. The Supabase store runs against an in-memory mock of supabase-js
// (test/fake-supabase.ts), not a real project — no Docker/Supabase was available here.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const asA = <T>(fn: () => Promise<T>) => runAsVisitor(A, fn);
const asB = <T>(fn: () => Promise<T>) => runAsVisitor(B, fn);

const dir = mkdtempSync(path.join(tmpdir(), "chiron-db-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const fake = fakeSupabase();

describe.each([
  ["file store", () => useBackend((v) => new FileStore(dir, v))],
  ["supabase store (mocked client)", () => useBackend((v) => new SupabaseDocStore(fake.client, "chiron-files", v))],
])("%s", (_name, install) => {
  beforeAll(install);

  it("refuses to run without a visitor", async () => {
    await expect(db().get("courses", "c_one")).rejects.toThrow(/No visitor/);
    await expect(db().list("courses")).rejects.toThrow(/No visitor/);
  });

  it("puts, gets, updates and lists documents", () =>
    asA(async () => {
      await db().put("courses", "c_one", { id: "c_one", n: 1 });
      await db().put("courses", "c_two", { id: "c_two", n: 2 });
      expect(await db().get("courses", "c_one")).toEqual({ id: "c_one", n: 1 });
      await db().update<{ n: number }>("courses", "c_one", (c) => {
        c.n = 5;
      });
      expect(await db().get("courses", "c_one")).toEqual({ id: "c_one", n: 5 });
      const big = await db().list<{ n: number }>("courses", (c) => c.n > 1);
      expect(big.map((c) => c.n).sort()).toEqual([2, 5]);
    }));

  it("never lets a reader see a half-written document", () =>
    asA(async () => {
      const big = {
        id: "v_torn",
        lines: Array.from({ length: 2000 }, (_, i) => `line ${i}`),
      };
      await db().put("visits", "v_torn", big);
      const writes = Array.from({ length: 15 }, (_, i) => db().put("visits", "v_torn", { ...big, n: i }));
      const seen = await Promise.all(Array.from({ length: 60 }, () => db().get<typeof big>("visits", "v_torn")));
      await Promise.all(writes);
      for (const doc of seen) expect(doc?.lines).toHaveLength(2000);
    }));

  it("loses no update when writers race on one document", () =>
    asA(async () => {
      await db().put("boards", "b_race", { count: 0 });
      await Promise.all(
        Array.from({ length: 20 }, () =>
          db().update<{ count: number }>("boards", "b_race", (b) => {
            b.count++;
          }),
        ),
      );
      expect(await db().get("boards", "b_race")).toEqual({ count: 20 });
    }));

  it("supports ids with a colon (course-level threads)", () =>
    asA(async () => {
      await db().put("threads", "course:c_one", { ok: true });
      expect(await db().get("threads", "course:c_one")).toEqual({ ok: true });
    }));

  it("rejects unsafe ids and blob keys", () =>
    asA(async () => {
      await expect(db().get("courses", "../etc")).rejects.toThrow();
      await expect(db().putBlob("../x", Buffer.from(""), "text/plain")).rejects.toThrow();
    }));

  it("throws NotFoundError when updating a missing document", () =>
    asA(async () => {
      await expect(db().update("courses", "c_missing", () => undefined)).rejects.toBeInstanceOf(NotFoundError);
    }));

  it("stores blobs and appends events", () =>
    asA(async () => {
      await db().putBlob("img_abc/original", Buffer.from("png"), "image/png");
      expect((await db().getBlob("img_abc/original"))?.contentType).toBe("image/png");
      expect(await db().hasBlob("img_abc/original")).toBe(true);
      await db().appendEvent("c_one", {
        at: "2026-10-11T00:00:00.000Z",
        type: "a",
      });
      await db().appendEvent("c_one", {
        at: "2026-10-11T00:00:01.000Z",
        type: "b",
      });
      expect((await db().readEvents("c_one")).map((e) => e.type)).toEqual(["a", "b"]);
    }));

  it("isolates visitors: B sees none of A's documents, files or events", async () => {
    await asB(async () => {
      expect(await db().get("courses", "c_one")).toBeNull();
      expect(await db().list("courses")).toEqual([]);
      await expect(db().update("courses", "c_one", () => undefined)).rejects.toBeInstanceOf(NotFoundError);
      expect(await db().getBlob("img_abc/original")).toBeNull();
      expect(await db().hasBlob("img_abc/original")).toBe(false);
      expect(await db().signedDownloadUrl("img_abc/original", 600)).toBeNull();
      expect(await db().readEvents("c_one")).toEqual([]);
      expect(await db().readEvents()).toEqual([]);
      // B writing the same ids touches only B's namespace…
      await db().put("courses", "c_one", { id: "c_one", owner: "B" });
      await db().remove("courses", "c_two");
    });
    // …and A's data is unchanged.
    await asA(async () => {
      expect(await db().get("courses", "c_one")).toEqual({ id: "c_one", n: 5 });
      expect(await db().get("courses", "c_two")).toEqual({ id: "c_two", n: 2 });
    });
  });
});

describe("supabase storage paths", () => {
  beforeAll(() => useBackend((v) => new SupabaseDocStore(fake.client, "chiron-files", v)));

  it("prefixes every object with the visitor id and signs short-lived URLs", async () => {
    await asA(async () => {
      expect([...fake.files.keys()]).toContain(`chiron-files/${A}/img_abc/original`);
      const url = await db().signedDownloadUrl("img_abc/original", 3600);
      expect(url).toContain(`/chiron-files/${A}/img_abc/original`);
      expect(url).toContain("expires=600"); // capped at 10 minutes
      expect(await db().signedUploadUrl("d_abc/original")).toContain(`/chiron-files/${A}/d_abc/original`);
    });
    expect(fake.tables.docs.every((r) => r.visitor_id === A || r.visitor_id === B)).toBe(true);
    expect(fake.tables.events.every((r) => r.visitor_id === A)).toBe(true);
  });
});

describe("storage selection", () => {
  it("uses Supabase when both variables are set", () => {
    expect(
      storageConfig({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "k",
      }).kind,
    ).toBe("supabase");
  });

  it("uses local files on localhost", () => {
    expect(storageConfig({}).kind).toBe("file");
  });

  it("refuses to start on Vercel without Supabase", () => {
    expect(() => storageConfig({ VERCEL_ENV: "production" })).toThrow(StorageConfigError);
    expect(() =>
      storageConfig({
        VERCEL_ENV: "preview",
        SUPABASE_URL: "https://x.supabase.co",
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
