import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, VISITOR_COOKIE, accessCodes, codeForToken, cookieOptions, isVisitorId, safeNext } from "@/lib/access";

// Runs before every page and API request (DECISIONS D16):
//  1. Every browser gets a random visitor id in an HttpOnly cookie; a missing or malformed one is
//     replaced. Server code reads it from the cookie — the client never sends it in bodies or URLs.
//  2. With ACCESS_CODES set, nothing but the code screen is reachable without a valid access cookie.

const OPEN_PATHS = ["/access"];

export function proxy(request: NextRequest) {
  const current = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = isVisitorId(current) ? current : randomUUID();
  const issued = visitorId !== current;

  const withVisitor = (res: NextResponse) => {
    if (issued) res.cookies.set(VISITOR_COOKIE, visitorId, cookieOptions());
    return res;
  };

  const { pathname, search } = request.nextUrl;
  const codes = accessCodes();
  if (codes.length && !OPEN_PATHS.includes(pathname) && !codeForToken(request.cookies.get(ACCESS_COOKIE)?.value, codes)) {
    if (pathname.startsWith("/api/")) {
      return withVisitor(NextResponse.json({ error: "Enter the access code to use CHIRON.", code: "access" }, { status: 401 }));
    }
    const url = new URL("/access", request.url);
    url.searchParams.set("next", safeNext(pathname + search));
    return withVisitor(NextResponse.redirect(url));
  }

  // Make a freshly issued id visible to this same request's server code.
  const headers = new Headers(request.headers);
  if (issued) {
    const others = request.cookies.getAll().filter((c) => c.name !== VISITOR_COOKIE);
    headers.set("cookie", [...others.map((c) => `${c.name}=${c.value}`), `${VISITOR_COOKIE}=${visitorId}`].join("; "));
  }
  return withVisitor(NextResponse.next({ request: { headers } }));
}

export const config = {
  // Everything except build assets and static files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|pdf\\.worker\\.min\\.mjs|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|txt)$).*)"],
};
