import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DocumentMeta, StudySession, UserProfile } from "./types";

// Local JSON persistence. One process, so a per-file promise chain is enough to keep
// read-modify-write updates from interleaving (e.g. a rating landing mid-answer).

// Runtime data, not part of the build: keep the tracer from walking the whole project.
export const DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
const dirs = {
  profiles: path.join(DATA_DIR, "profiles"),
  sessions: path.join(DATA_DIR, "sessions"),
  events: path.join(DATA_DIR, "events"),
  documents: path.join(DATA_DIR, "documents"),
};

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

const safeId = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("invalid id");
  return id;
};

export function newId(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// ── Profiles ─────────────────────────────────────────────────────────────────

const profileFile = (id: string) => path.join(dirs.profiles, `${safeId(id)}.json`);

export const getProfile = (id: string) => readJson<UserProfile>(profileFile(id));

export const saveProfile = (p: UserProfile) =>
  withLock(profileFile(p.id), () => writeJson(profileFile(p.id), p));

export function updateProfile(id: string, fn: (p: UserProfile) => UserProfile | void) {
  const file = profileFile(id);
  return withLock(file, async () => {
    const p = await readJson<UserProfile>(file);
    if (!p) throw new Error(`profile ${id} not found`);
    const out = fn(p) ?? p;
    out.updatedAt = new Date().toISOString();
    await writeJson(file, out);
    return out;
  });
}

// ── Sessions ─────────────────────────────────────────────────────────────────

const sessionFile = (id: string) => path.join(dirs.sessions, `${safeId(id)}.json`);

export const getSession = (id: string) => readJson<StudySession>(sessionFile(id));

export const saveSession = (s: StudySession) =>
  withLock(sessionFile(s.id), () => writeJson(sessionFile(s.id), s));

export function updateSession(id: string, fn: (s: StudySession) => StudySession | void) {
  const file = sessionFile(id);
  return withLock(file, async () => {
    const s = await readJson<StudySession>(file);
    if (!s) throw new Error(`session ${id} not found`);
    const out = fn(s) ?? s;
    out.lastActiveAt = new Date().toISOString();
    await writeJson(file, out);
    return out;
  });
}

export async function listSessions(): Promise<StudySession[]> {
  let files: string[] = [];
  try {
    files = await fs.readdir(/*turbopackIgnore: true*/ dirs.sessions);
  } catch {
    return [];
  }
  const all = await Promise.all(
    files.filter((f) => f.endsWith(".json")).map((f) => readJson<StudySession>(path.join(dirs.sessions, f))),
  );
  return all
    .filter((s): s is StudySession => !!s)
    .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

// ── Documents ────────────────────────────────────────────────────────────────

export const documentDir = (id: string) => path.join(dirs.documents, safeId(id));
const documentMetaFile = (id: string) => path.join(documentDir(id), "meta.json");

export const getDocument = (id: string) => readJson<DocumentMeta>(documentMetaFile(id));

export const saveDocument = (d: DocumentMeta) =>
  withLock(documentMetaFile(d.id), () => writeJson(documentMetaFile(d.id), d));

export function updateDocument(id: string, fn: (d: DocumentMeta) => DocumentMeta | void) {
  const file = documentMetaFile(id);
  return withLock(file, async () => {
    const d = await readJson<DocumentMeta>(file);
    if (!d) throw new Error(`document ${id} not found`);
    const out = fn(d) ?? d;
    await writeJson(file, out);
    return out;
  });
}

export async function writeDocumentFile(id: string, name: string, data: Buffer | string) {
  const dir = documentDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, path.basename(name)), data);
}

export async function readDocumentFile(id: string, name: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(documentDir(id), path.basename(name)));
  } catch {
    return null;
  }
}

// ── Events (append-only JSONL) ───────────────────────────────────────────────

const eventFile = (sessionId: string) => path.join(dirs.events, `${safeId(sessionId)}.jsonl`);

export function appendEvent(sessionId: string, event: Record<string, unknown>) {
  const file = eventFile(sessionId);
  return withLock(file, async () => {
    await fs.mkdir(dirs.events, { recursive: true });
    await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
  });
}

export async function readEvents(sessionId: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await fs.readFile(eventFile(sessionId), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
