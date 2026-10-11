import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { type Collection, type DocStore, NotFoundError, checkBlobKey, checkId } from "./types";

// Local-file store (localhost). One folder per visitor: <root>/visitors/<visitorId>/<collection>/<id>.json,
// so local behaviour matches production isolation. Never used on Vercel (see ./index.ts).

// Shared across per-visitor instances: one in-process lock per file.
const locks = new Map<string, Promise<unknown>>();

export class FileStore implements DocStore {
  private root: string;

  constructor(dataDir: string, visitorId: string) {
    this.root = path.join(dataDir, "visitors", visitorId);
  }

  private file(col: Collection, id: string) {
    return path.join(this.root, col, `${checkId(id)}.json`);
  }

  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  /** Atomic: readers (which don't take the lock) never see a half-written file. */
  private async writeJson(file: string, value: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    // Windows refuses to replace a file another handle has open (EPERM/EBUSY); a reader holds it
    // only briefly, so retry.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, file);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt >= 20 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
          await fs.rm(tmp, { force: true });
          throw err;
        }
        await new Promise((r) => setTimeout(r, 10 + attempt * 10));
      }
    }
  }

  async get<T>(col: Collection, id: string) {
    return this.readJson<T>(this.file(col, id));
  }

  async put<T>(col: Collection, id: string, value: T) {
    const file = this.file(col, id);
    return this.lock(file, () => this.writeJson(file, value));
  }

  async update<T>(col: Collection, id: string, fn: (value: T) => T | void) {
    const file = this.file(col, id);
    return this.lock(file, async () => {
      const current = await this.readJson<T>(file);
      if (current == null) throw new NotFoundError(`${col}/${id} not found`);
      const next = fn(current) ?? current;
      await this.writeJson(file, next);
      return next;
    });
  }

  async list<T>(col: Collection, where?: (value: T) => boolean) {
    let names: string[];
    try {
      names = await fs.readdir(/*turbopackIgnore: true*/ path.join(this.root, col));
    } catch {
      return [];
    }
    const all = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => this.readJson<T>(path.join(this.root, col, n))));
    return all.filter((v): v is Awaited<T> & T => v != null && (!where || where(v)));
  }

  async remove(col: Collection, id: string) {
    await fs.rm(this.file(col, id), { force: true });
  }

  async appendEvent(stream: string, event: Record<string, unknown>) {
    const file = path.join(this.root, "events", `${checkId(stream)}.jsonl`);
    return this.lock(file, async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
    });
  }

  async readEvents(stream?: string) {
    const dir = path.join(this.root, "events");
    let names: string[];
    try {
      names = stream ? [`${checkId(stream)}.jsonl`] : (await fs.readdir(/*turbopackIgnore: true*/ dir)).filter((n) => n.endsWith(".jsonl"));
    } catch {
      return [];
    }
    const out: Record<string, unknown>[] = [];
    for (const n of names) {
      const raw = await fs.readFile(path.join(dir, n), "utf8").catch(() => "");
      for (const line of raw.split("\n")) if (line.trim()) out.push(JSON.parse(line));
    }
    return out;
  }

  private blobPath(key: string) {
    return path.join(this.root, "blobs", ...checkBlobKey(key).split("/"));
  }

  async putBlob(key: string, data: Buffer, contentType: string) {
    const file = this.blobPath(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    await fs.writeFile(file + ".type", contentType, "utf8");
  }

  async getBlob(key: string) {
    const file = this.blobPath(key);
    try {
      const [data, contentType] = await Promise.all([fs.readFile(file), fs.readFile(file + ".type", "utf8").catch(() => "application/octet-stream")]);
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async hasBlob(key: string) {
    return fs.stat(this.blobPath(key)).then(
      () => true,
      () => false,
    );
  }

  /** Local files go through the API routes; no direct upload or download URLs. */
  async signedUploadUrl() {
    return null;
  }

  async signedDownloadUrl() {
    return null;
  }
}
