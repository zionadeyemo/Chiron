import { createHmac, timingSafeEqual } from "node:crypto";

// Anonymous visitors and the shared access code (DECISIONS D16). Pure helpers, used by
// src/proxy.ts and by server code. Nothing here is imported by client components.

export const VISITOR_COOKIE = "chiron_vid";
export const ACCESS_COOKIE = "chiron_access";
export const ONE_YEAR = 60 * 60 * 24 * 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A well-formed, lower-case UUID — the only shape a visitor id may take. */
export function isVisitorId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function cookieOptions(maxAge = ONE_YEAR) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** ACCESS_CODES="ruby,aidan,mentor1". Empty or unset: no gate. */
export function accessCodes(): string[] {
  return (process.env.ACCESS_CODES ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function cookieSecret(): string {
  const secret = process.env.COOKIE_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("COOKIE_SECRET must be set (32+ characters) when ACCESS_CODES is set.");
  return "chiron-local-development-cookie-secret";
}

/** The chiron_access cookie value for a code: an HMAC, so the cookie can't be forged or read back. */
export function accessToken(code: string): string {
  return createHmac("sha256", cookieSecret()).update(`access:${code.trim().toLowerCase()}`).digest("hex");
}

/** The code that a chiron_access cookie value was issued for, if it's still a valid code. */
export function codeForToken(token: string | undefined, codes = accessCodes()): string | null {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const given = Buffer.from(token, "hex");
  for (const code of codes) {
    if (timingSafeEqual(given, Buffer.from(accessToken(code), "hex"))) return code;
  }
  return null;
}

/** Same-origin relative paths only, so ?next= can't redirect elsewhere. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
