import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { createRouteMatcher } from "@clerk/nextjs/server";

// We don't invoke the real `clerkMiddleware(...)` wrapper here — that requires a full
// Clerk runtime (publishable key, auth context, etc.) that isn't worth standing up for
// a unit test. Instead we extract the literal route-pattern array passed to
// `createRouteMatcher` straight from the middleware source and exercise Clerk's *real*
// (unmocked) matcher against it. This verifies the actual regex semantics without
// duplicating the pattern list by hand (which could silently drift from the source).

function extractProtectedRoutes(): string[] {
  const source = readFileSync(join(__dirname, "../middleware.ts"), "utf-8");
  const match = source.match(/createRouteMatcher\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) throw new Error("Could not find createRouteMatcher([...]) in middleware.ts");
  const arrayBody = match[1];
  const patterns = Array.from(arrayBody.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  if (patterns.length === 0) throw new Error("Parsed zero route patterns from middleware.ts");
  return patterns;
}

function fakeRequest(pathname: string) {
  return { nextUrl: { pathname } } as unknown as Parameters<ReturnType<typeof createRouteMatcher>>[0];
}

describe("middleware protected-route matcher", () => {
  const patterns = extractProtectedRoutes();
  const isProtected = createRouteMatcher(patterns);

  it("parsed the expected route patterns from middleware.ts", () => {
    expect(patterns).toContain("/settings(.*)");
    expect(patterns).toContain("/dashboard(.*)");
    expect(patterns).toContain("/onboarding(.*)");
  });

  it("matches /settings", () => {
    expect(isProtected(fakeRequest("/settings"))).toBe(true);
  });

  it("matches nested /settings paths", () => {
    expect(isProtected(fakeRequest("/settings/billing"))).toBe(true);
  });

  it("matches /settings with a trailing slash", () => {
    expect(isProtected(fakeRequest("/settings/"))).toBe(true);
  });

  it("still matches the other known-protected routes", () => {
    expect(isProtected(fakeRequest("/dashboard"))).toBe(true);
    expect(isProtected(fakeRequest("/onboarding"))).toBe(true);
    expect(isProtected(fakeRequest("/verify"))).toBe(true);
    expect(isProtected(fakeRequest("/listings/new"))).toBe(true);
  });

  it("matches /admin and nested admin routes (C2 — gate admin pages behind auth)", () => {
    expect(isProtected(fakeRequest("/admin"))).toBe(true);
    expect(isProtected(fakeRequest("/admin/invites"))).toBe(true);
    expect(isProtected(fakeRequest("/admin/reports"))).toBe(true);
  });

  it("does not match unrelated public routes", () => {
    expect(isProtected(fakeRequest("/"))).toBe(false);
    expect(isProtected(fakeRequest("/listings"))).toBe(false);
    expect(isProtected(fakeRequest("/about"))).toBe(false);
  });

  it("does not match a route that merely contains 'settings' as a substring of another segment", () => {
    expect(isProtected(fakeRequest("/usersettings"))).toBe(false);
  });
});
