import "server-only";
import path from "node:path";
import { currentVisitor } from "../visitor";
import { FileStore } from "./file";
import { DEFAULT_BUCKET, SupabaseDocStore, supabaseClient } from "./supabase";
import type { Collection, DocStore } from "./types";

// Storage entry point. `db()` is the only way to reach storage, and every call on it first
// resolves the current visitor (cookie, or runAsVisitor in scripts/tests) and throws without
// one — no method can run unscoped (DECISIONS D16).
//
// Which store: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → Supabase. Otherwise local files —
// except on Vercel (production/preview), where that would silently lose data, so we refuse.

export { NotFoundError, newId } from "./types";
export type { Collection, DocStore, StoredBlob } from "./types";

export class StorageConfigError extends Error {}

type Backend = (visitorId: string) => DocStore;

export function storageConfig(env: Record<string, string | undefined> = process.env) {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key)
    return {
      kind: "supabase" as const,
      url,
      key,
      bucket: env.SUPABASE_BUCKET?.trim() || DEFAULT_BUCKET,
    };
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    throw new StorageConfigError(
      `CHIRON storage is not configured on this ${env.VERCEL_ENV} deployment: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ` +
        "Refusing to fall back to local files, which do not persist on Vercel.",
    );
  }
  // Runtime data, not part of the build: keep the bundler from tracing the whole project.
  return {
    kind: "file" as const,
    dir: env.CHIRON_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"),
  };
}

function makeBackend(): Backend {
  const config = storageConfig();
  if (config.kind === "supabase") {
    const client = supabaseClient(config.url, config.key);
    return (visitorId) => new SupabaseDocStore(client, config.bucket, visitorId);
  }
  return (visitorId) => new FileStore(config.dir, visitorId);
}

let backend: Backend | null = null;

async function scoped(): Promise<DocStore> {
  const visitorId = await currentVisitor();
  return (backend ??= makeBackend())(visitorId);
}

const store: DocStore = {
  get: async <T>(col: Collection, id: string) => (await scoped()).get<T>(col, id),
  put: async <T>(col: Collection, id: string, value: T) => (await scoped()).put(col, id, value),
  update: async <T>(col: Collection, id: string, fn: (value: T) => T | void) => (await scoped()).update<T>(col, id, fn),
  list: async <T>(col: Collection, where?: (value: T) => boolean) => (await scoped()).list<T>(col, where),
  remove: async (col, id) => (await scoped()).remove(col, id),
  appendEvent: async (stream, event) => (await scoped()).appendEvent(stream, event),
  readEvents: async (stream) => (await scoped()).readEvents(stream),
  putBlob: async (key, data, contentType) => (await scoped()).putBlob(key, data, contentType),
  getBlob: async (key) => (await scoped()).getBlob(key),
  hasBlob: async (key) => (await scoped()).hasBlob(key),
  signedUploadUrl: async (key) => (await scoped()).signedUploadUrl(key),
  signedDownloadUrl: async (key, seconds) => (await scoped()).signedDownloadUrl(key, seconds),
};

/** The current visitor's store. */
export function db(): DocStore {
  return store;
}

/** Startup check (instrumentation.ts): fail loudly on a misconfigured deployment. */
export function assertStorageConfigured() {
  return storageConfig().kind;
}

/** Tests only: point storage at a fresh directory, or at any backend. */
export function useDataDir(dir: string) {
  backend = (visitorId) => new FileStore(dir, visitorId);
}
export function useBackend(make: Backend) {
  backend = make;
}
