import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { VISITOR_COOKIE, isVisitorId } from "./access";

// Who the current request belongs to. Every DocStore call resolves this first, so no storage
// access can happen without a visitor (DECISIONS D16).

export class NoVisitorError extends Error {
  constructor() {
    super("No visitor: storage was used outside a request that carries a valid chiron_vid cookie.");
  }
}

const explicit = new AsyncLocalStorage<string>();

/** Scripts and tests: run `fn` as a given visitor. Requests use the cookie instead. */
export function runAsVisitor<T>(visitorId: string, fn: () => T): T {
  if (!isVisitorId(visitorId)) throw new Error(`not a visitor id: ${visitorId}`);
  return explicit.run(visitorId, fn);
}

export async function currentVisitor(): Promise<string> {
  const pinned = explicit.getStore();
  if (pinned) return pinned;
  let value: string | undefined;
  try {
    value = (await cookies()).get(VISITOR_COOKIE)?.value;
  } catch {
    throw new NoVisitorError(); // not inside a request
  }
  if (!isVisitorId(value)) throw new NoVisitorError();
  return value;
}
