import type { SupabaseClient } from "@supabase/supabase-js";

// An in-memory stand-in for the parts of supabase-js that SupabaseDocStore uses: the PostgREST
// query builder (select/eq/order/range/maybeSingle/upsert/update/delete/insert) and Storage
// (upload/download/exists/createSignedUploadUrl/createSignedUrl). Rows round-trip through JSON like
// jsonb does, and every query resolves on a later tick so concurrent requests really interleave.
// It is NOT Supabase: it can't catch SQL, RLS or network behaviour — see docs/DEPLOY.md.

type Row = Record<string, unknown>;
type Filter = [string, unknown];
type Result = { data: unknown; error: { message: string } | null };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));

export function fakeSupabase() {
  const tables: Record<string, Row[]> = { docs: [], events: [] };
  const files = new Map<string, { data: Buffer; type: string }>();
  let seq = 0;

  class Query implements PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }> {
    private filters: Filter[] = [];
    private op: "select" | "upsert" | "update" | "delete" | "insert" = "select";
    private cols = "*";
    private returning: string | null = null;
    private payload: Row = {};
    private conflict: string[] = [];
    private orderBy: string | null = null;
    private window: [number, number] | null = null;
    private single = false;

    constructor(private table: string) {
      tables[table] ??= [];
    }
    select(cols = "*") {
      if (this.op === "select") this.cols = cols;
      else this.returning = cols;
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push([col, value]);
      return this;
    }
    order(col: string) {
      this.orderBy = col;
      return this;
    }
    range(from: number, to: number) {
      this.window = [from, to];
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    upsert(row: Row, opts: { onConflict: string }) {
      this.op = "upsert";
      this.payload = row;
      this.conflict = opts.onConflict.split(",");
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    insert(row: Row) {
      this.op = "insert";
      this.payload = row;
      return this;
    }

    private pick(row: Row, cols: string) {
      if (cols === "*") return clone(row);
      return Object.fromEntries(cols.split(",").map((c) => [c.trim(), clone(row[c.trim()])]));
    }

    private async run() {
      await tick();
      const rows = tables[this.table];
      const match = (r: Row) => this.filters.every(([c, v]) => r[c] === v);
      switch (this.op) {
        case "select": {
          let out = rows.filter(match);
          if (this.orderBy) {
            const k = this.orderBy;
            out = [...out].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0));
          }
          if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
          const data = out.map((r) => this.pick(r, this.cols));
          if (this.single) return data.length > 1 ? { data: null, error: { message: "multiple rows" } } : { data: data[0] ?? null, error: null };
          return { data, error: null };
        }
        case "upsert": {
          const row = clone(this.payload);
          const i = rows.findIndex((r) => this.conflict.every((k) => r[k] === row[k]));
          if (i >= 0) rows[i] = row;
          else rows.push(row);
          return { data: null, error: null };
        }
        case "update": {
          const hit = rows.filter(match);
          for (const r of hit) Object.assign(r, clone(this.payload));
          return {
            data: this.returning ? hit.map((r) => this.pick(r, this.returning!)) : null,
            error: null,
          };
        }
        case "delete": {
          tables[this.table] = rows.filter((r) => !match(r));
          return { data: null, error: null };
        }
        case "insert": {
          rows.push({ ...clone(this.payload), seq: ++seq });
          return { data: null, error: null };
        }
      }
    }

    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return (this.run() as Promise<Result>).then(ok, bad);
    }
  }

  const storage = {
    from: (bucket: string) => {
      const key = (p: string) => `${bucket}/${p}`;
      return {
        async upload(path: string, data: Buffer, opts: { contentType: string }) {
          await tick();
          files.set(key(path), {
            data: Buffer.from(data),
            type: opts.contentType,
          });
          return { data: { path }, error: null };
        },
        async download(path: string) {
          await tick();
          const f = files.get(key(path));
          return f
            ? {
                data: new Blob([new Uint8Array(f.data)], { type: f.type }),
                error: null,
              }
            : { data: null, error: { message: "Object not found" } };
        },
        async exists(path: string) {
          await tick();
          return files.has(key(path)) ? { data: true, error: null } : { data: false, error: { message: "Object not found" } };
        },
        async createSignedUploadUrl(path: string) {
          return {
            data: {
              signedUrl: `https://fake.supabase.co/storage/v1/object/upload/sign/${key(path)}?token=t`,
              token: "t",
              path,
            },
            error: null,
          };
        },
        async createSignedUrl(path: string, seconds: number) {
          return {
            data: {
              signedUrl: `https://fake.supabase.co/storage/v1/object/sign/${key(path)}?token=t&expires=${seconds}`,
            },
            error: null,
          };
        },
      };
    },
  };

  const client = {
    from: (table: string) => new Query(table),
    storage,
  } as unknown as SupabaseClient;
  return { client, tables, files };
}
