// The document-store contract. Every persistent read/write goes through it; implementations are
// constructed per visitor, so a store instance can only ever see one visitor's data.

export type Collection = "profiles" | "courses" | "visits" | "problems" | "plans" | "boards" | "threads" | "documents" | "meta";

export interface StoredBlob {
  data: Buffer;
  contentType: string;
}

export interface DocStore {
  get<T>(col: Collection, id: string): Promise<T | null>;
  put<T>(col: Collection, id: string, value: T): Promise<void>;
  /** Read-modify-write, safe against concurrent writers. Throws NotFoundError if the document doesn't exist. */
  update<T>(col: Collection, id: string, fn: (value: T) => T | void): Promise<T>;
  list<T>(col: Collection, where?: (value: T) => boolean): Promise<T[]>;
  remove(col: Collection, id: string): Promise<void>;
  appendEvent(stream: string, event: Record<string, unknown>): Promise<void>;
  readEvents(stream?: string): Promise<Record<string, unknown>[]>;
  putBlob(key: string, data: Buffer, contentType: string): Promise<void>;
  getBlob(key: string): Promise<StoredBlob | null>;
  hasBlob(key: string): Promise<boolean>;
  /** A URL the browser can PUT the file to directly, or null if uploads go through the API (local files). */
  signedUploadUrl(key: string): Promise<string | null>;
  /** A short-lived URL to fetch the file directly, or null if downloads go through the API. Null if missing. */
  signedDownloadUrl(key: string, seconds: number): Promise<string | null>;
}

export class NotFoundError extends Error {}

const ID = /^[a-zA-Z0-9_:-]{1,80}$/;
const BLOB_KEY = /^[a-zA-Z0-9_-]{1,80}(\/[a-zA-Z0-9_.-]{1,80})?$/;

export function checkId(id: string) {
  if (!ID.test(id)) throw new Error(`invalid id: ${id}`);
  return id.replace(/:/g, "~"); // ':' isn't allowed in Windows file names
}

export function checkBlobKey(key: string) {
  if (!BLOB_KEY.test(key) || key.includes("..")) throw new Error(`invalid blob key: ${key}`);
  return key;
}

export function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
