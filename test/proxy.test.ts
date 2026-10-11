import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE, VISITOR_COOKIE, accessToken, codeForToken, isVisitorId, safeNext } from "@/lib/access";
import { proxy } from "@/proxy";

const VID = "33333333-3333-4333-8333-333333333333";

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

/** The visitor id the request's server code will see (forwarded request header). */
function forwardedVisitor(res: Response) {
  const cookie = res.headers.get("x-middleware-request-cookie") ?? "";
  return cookie.match(new RegExp(`${VISITOR_COOKIE}=([^;]+)`))?.[1];
}

afterEach(() => vi.unstubAllEnvs());

describe("visitor cookie", () => {
  it("issues a random UUID on the first request, with the required attributes", () => {
    const res = proxy(request("/"));
    const set = res.headers.get("set-cookie") ?? "";
    const vid = set.match(/chiron_vid=([^;]+)/)?.[1];
    expect(isVisitorId(vid)).toBe(true);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Path=\//);
    expect(set).toMatch(/Max-Age=31536000/);
    expect(forwardedVisitor(res)).toBe(vid); // the same request already runs as the new visitor
  });

  it("keeps a valid visitor id", () => {
    const res = proxy(request("/", { [VISITOR_COOKIE]: VID }));
    expect(res.headers.get("set-cookie") ?? "").not.toContain(VISITOR_COOKIE);
  });

  it.each(["not-a-uuid", `${VID}x`, VID.slice(1), "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "33333333-3333-3333-3333-333333333333", "", "../../etc"])(
    "replaces a malformed id (%s) with a fresh one",
    (bad) => {
      const res = proxy(request("/api/courses", { [VISITOR_COOKIE]: bad }));
      const vid = res.headers.get("set-cookie")?.match(/chiron_vid=([^;]+)/)?.[1];
      expect(isVisitorId(vid)).toBe(true);
      expect(vid).not.toBe(VID);
      expect(forwardedVisitor(res)).toBe(vid);
    },
  );

  it("marks the cookie Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(request("/")).headers.get("set-cookie")).toMatch(/Secure/i);
  });
});

describe("access gate", () => {
  it("is off when ACCESS_CODES is unset", () => {
    vi.stubEnv("ACCESS_CODES", "");
    const res = proxy(request("/", { [VISITOR_COOKIE]: VID }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects pages to the code screen without a valid access cookie", () => {
    vi.stubEnv("ACCESS_CODES", "ruby,aidan");
    const res = proxy(request("/course/c_x?y=1", { [VISITOR_COOKIE]: VID }));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/access");
    expect(to.searchParams.get("next")).toBe("/course/c_x?y=1");
  });

  it("answers API calls with 401 instead of a redirect", async () => {
    vi.stubEnv("ACCESS_CODES", "ruby");
    const res = proxy(request("/api/courses", { [VISITOR_COOKIE]: VID }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("access");
  });

  it("rejects a forged or stale access cookie", () => {
    vi.stubEnv("ACCESS_CODES", "ruby");
    expect(proxy(request("/", { [VISITOR_COOKIE]: VID, [ACCESS_COOKIE]: "ruby" })).status).toBe(307);
    expect(
      proxy(
        request("/", {
          [VISITOR_COOKIE]: VID,
          [ACCESS_COOKIE]: "0".repeat(64),
        }),
      ).status,
    ).toBe(307);
    const aidan = accessToken("aidan");
    expect(proxy(request("/", { [VISITOR_COOKIE]: VID, [ACCESS_COOKIE]: aidan })).status).toBe(307); // code since removed
  });

  it("lets a valid access cookie through, and keeps the code screen reachable", () => {
    vi.stubEnv("ACCESS_CODES", "ruby,aidan");
    expect(
      proxy(
        request("/", {
          [VISITOR_COOKIE]: VID,
          [ACCESS_COOKIE]: accessToken("aidan"),
        }),
      ).status,
    ).toBe(200);
    expect(proxy(request("/access", { [VISITOR_COOKIE]: VID })).status).toBe(200);
    expect(codeForToken(accessToken("Ruby "), ["ruby", "aidan"])).toBe("ruby");
  });

  it("requires COOKIE_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCESS_CODES", "ruby");
    vi.stubEnv("COOKIE_SECRET", "");
    expect(() =>
      proxy(
        request("/", {
          [VISITOR_COOKIE]: VID,
          [ACCESS_COOKIE]: "a".repeat(64),
        }),
      ),
    ).toThrow(/COOKIE_SECRET/);
  });

  it("only redirects to same-site paths after the code", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/course/c_1")).toBe("/course/c_1");
  });
});
