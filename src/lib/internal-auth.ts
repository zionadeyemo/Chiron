import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// /internal/summary is protected by INTERNAL_PASSWORD. The cookie holds a hash of the password,
// never the password itself. Without the env var the page is open in development and closed in
// production (DECISIONS D15).

export const INTERNAL_COOKIE = "chiron_internal";

const digest = (s: string) => createHash("sha256").update(`chiron-internal:${s}`).digest("hex");

export function internalConfigured() {
  return Boolean(process.env.INTERNAL_PASSWORD) || process.env.NODE_ENV !== "production";
}

export function passwordMatches(attempt: string) {
  const pw = process.env.INTERNAL_PASSWORD;
  if (!pw) return false;
  const a = Buffer.from(digest(attempt));
  const b = Buffer.from(digest(pw));
  return timingSafeEqual(a, b);
}

export function tokenFor(pw = process.env.INTERNAL_PASSWORD ?? "") {
  return digest(pw);
}

export async function internalAllowed() {
  const pw = process.env.INTERNAL_PASSWORD;
  if (!pw) return process.env.NODE_ENV !== "production";
  const token = (await cookies()).get(INTERNAL_COOKIE)?.value ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(tokenFor(pw));
  return a.length === b.length && timingSafeEqual(a, b);
}
