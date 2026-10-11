import "server-only";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { type Collection, type DocStore, NotFoundError, checkBlobKey, checkId } from "./types";

// Supabase store (Vercel). Server-only, with the service-role key — which bypasses Row Level
// Security, so isolation is enforced HERE: every query filters on this instance's visitor id, and
// every storage path starts with it. RLS is still on with no policies, so the anon key can read
// nothing (docs/SUPABASE.sql). Schema: one key-value `docs` table and an `events` table.

export const DEFAULT_BUCKET = "chiron-files";
const PAGE = 1000;

export function supabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

class StoreError extends Error {}
const fail = (what: string, error: { message: string }) => new StoreError(`Supabase ${what} failed: ${error.message}`);

/** A fresh optimistic-concurrency version for every write. */
const nextVersion = () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

type DocRow<T> = { data: T; version: number };

export class SupabaseDocStore implements DocStore {
  constructor(
    private sb: SupabaseClient,
    private bucket: string,
    private visitorId: string,
  ) {}

  private docs() {
    return this.sb.from("docs");
  }

  private async row<T>(col: Collection, id: string): Promise<DocRow<T> | null> {
    checkId(id);
    const { data, error } = await this.docs().select("data, version").eq("visitor_id", this.visitorId).eq("collection", col).eq("id", id).maybeSingle();
    if (error) throw fail("read", error);
    return (data as DocRow<T> | null) ?? null;
  }

  async get<T>(col: Collection, id: string) {
    return (await this.row<T>(col, id))?.data ?? null;
  }

  async put<T>(col: Collection, id: string, value: T) {
    checkId(id);
    const { error } = await this.docs().upsert(
      {
        visitor_id: this.visitorId,
        collection: col,
        id,
        data: value,
        version: nextVersion(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "visitor_id,collection,id" },
    );
    if (error) throw fail("write", error);
  }

  /** Optimistic: write back only if nobody wrote since we read; otherwise re-read and retry. */
  async update<T>(col: Collection, id: string, fn: (value: T) => T | void) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await this.row<T>(col, id);
      if (!current) throw new NotFoundError(`${col}/${id} not found`);
      const next = fn(current.data) ?? current.data;
      const { data, error } = await this.docs()
        .update({
          data: next,
          version: nextVersion(),
          updated_at: new Date().toISOString(),
        })
        .eq("visitor_id", this.visitorId)
        .eq("collection", col)
        .eq("id", id)
        .eq("version", current.version)
        .select("id");
      if (error) throw fail("update", error);
      if (data && data.length) return next;
      await new Promise((r) => setTimeout(r, 10 + Math.random() * Math.min(200, 20 * (attempt + 1))));
    }
    throw new StoreError(`${col}/${id} is being changed by another request; try again.`);
  }

  private async paged<R>(query: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>) {
    const out: R[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await query(from, from + PAGE - 1);
      if (error) throw fail("list", error);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) return out;
    }
  }

  async list<T>(col: Collection, where?: (value: T) => boolean) {
    const rows = await this.paged<{ data: T }>((from, to) =>
      this.docs().select("data").eq("visitor_id", this.visitorId).eq("collection", col).order("id").range(from, to),
    );
    return rows.map((r) => r.data).filter((v) => !where || where(v));
  }

  async remove(col: Collection, id: string) {
    checkId(id);
    const { error } = await this.docs().delete().eq("visitor_id", this.visitorId).eq("collection", col).eq("id", id);
    if (error) throw fail("delete", error);
  }

  async appendEvent(stream: string, event: Record<string, unknown>) {
    checkId(stream);
    const at = typeof event.at === "string" ? event.at : new Date().toISOString();
    const { error } = await this.sb.from("events").insert({ visitor_id: this.visitorId, stream, at, data: event });
    if (error) throw fail("event write", error);
  }

  async readEvents(stream?: string) {
    if (stream) checkId(stream);
    const rows = await this.paged<{ data: Record<string, unknown> }>((from, to) => {
      let q = this.sb.from("events").select("data").eq("visitor_id", this.visitorId);
      if (stream) q = q.eq("stream", stream);
      return q.order("seq").range(from, to);
    });
    return rows.map((r) => r.data);
  }

  // ── Files: private bucket, every path prefixed with the visitor id ────────────────────────

  private path(key: string) {
    return `${this.visitorId}/${checkBlobKey(key)}`;
  }

  private files() {
    return this.sb.storage.from(this.bucket);
  }

  async putBlob(key: string, data: Buffer, contentType: string) {
    const { error } = await this.files().upload(this.path(key), data, {
      contentType,
      upsert: true,
    });
    if (error) throw fail("upload", error);
  }

  async getBlob(key: string) {
    const path = this.path(key);
    if (!(await this.hasBlob(key))) return null;
    const { data, error } = await this.files().download(path);
    if (error || !data) return null;
    return {
      data: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || "application/octet-stream",
    };
  }

  async hasBlob(key: string) {
    const { data, error } = await this.files().exists(this.path(key));
    if (error && data !== false) throw fail("exists", error);
    return data === true;
  }

  async signedUploadUrl(key: string) {
    const { data, error } = await this.files().createSignedUploadUrl(this.path(key));
    if (error || !data) throw fail("signing an upload", error ?? { message: "no URL" });
    return data.signedUrl;
  }

  async signedDownloadUrl(key: string, seconds: number) {
    if (!(await this.hasBlob(key))) return null;
    const { data, error } = await this.files().createSignedUrl(this.path(key), Math.min(seconds, 600));
    if (error || !data) throw fail("signing a download", error ?? { message: "no URL" });
    return data.signedUrl;
  }
}
