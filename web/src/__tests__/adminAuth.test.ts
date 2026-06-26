import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// C2 — admin pages must be gated behind isAdmin(). We exercise the real
// isAdmin() source from each of the three files that define it (layout +
// both pages) by extracting and eval'ing the function body, the same
// source-reading pattern used in middleware.test.ts. This avoids having to
// stand up a full Clerk/Next render harness just to prove the allowlist
// comparison logic is correct.

function extractIsAdminFn(relativePath: string): (userId: string | null) => boolean {
  const source = readFileSync(join(__dirname, "../app/admin", relativePath), "utf-8");
  const match = source.match(/function isAdmin\(userId: string \| null\): boolean \{[\s\S]*?\n\}/);
  if (!match) throw new Error(`Could not find isAdmin() in ${relativePath}`);
  // Strip TypeScript-only syntax (param/return type annotations) so this
  // compiles as plain JS for new Function() — the runtime logic itself is
  // untouched.
  const jsSource = match[0]
    .replace("function isAdmin(userId: string | null): boolean {", "function isAdmin(userId) {");
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${jsSource}; return isAdmin;`);
  return factory();
}

describe.each([
  ["layout.tsx"],
  ["invites/page.tsx"],
  ["reports/page.tsx"],
])("isAdmin() in admin/%s", (file) => {
  it("returns false for null userId", () => {
    const isAdmin = extractIsAdminFn(file);
    expect(isAdmin(null)).toBe(false);
  });

  it("returns false when ADMIN_USER_IDS is unset", () => {
    const prev = process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_USER_IDS;
    const isAdmin = extractIsAdminFn(file);
    expect(isAdmin("user_123")).toBe(false);
    if (prev !== undefined) process.env.ADMIN_USER_IDS = prev;
  });

  it("returns true only for ids in the comma-separated allowlist", () => {
    const prev = process.env.ADMIN_USER_IDS;
    process.env.ADMIN_USER_IDS = "user_abc, user_def";
    const isAdmin = extractIsAdminFn(file);
    expect(isAdmin("user_abc")).toBe(true);
    expect(isAdmin("user_def")).toBe(true);
    expect(isAdmin("user_xyz")).toBe(false);
    if (prev !== undefined) process.env.ADMIN_USER_IDS = prev;
    else delete process.env.ADMIN_USER_IDS;
  });

  it("does not match via substring (e.g. user_ab is not user_abc)", () => {
    const prev = process.env.ADMIN_USER_IDS;
    process.env.ADMIN_USER_IDS = "user_abc";
    const isAdmin = extractIsAdminFn(file);
    expect(isAdmin("user_ab")).toBe(false);
    expect(isAdmin("user_abcd")).toBe(false);
    if (prev !== undefined) process.env.ADMIN_USER_IDS = prev;
    else delete process.env.ADMIN_USER_IDS;
  });
});

describe("admin gate response strategy", () => {
  it("layout.tsx, invites/page.tsx, and reports/page.tsx all use notFound() for non-admins (consistent 404 strategy)", () => {
    const layout = readFileSync(join(__dirname, "../app/admin/layout.tsx"), "utf-8");
    const invitesPage = readFileSync(join(__dirname, "../app/admin/invites/page.tsx"), "utf-8");
    const reportsPage = readFileSync(join(__dirname, "../app/admin/reports/page.tsx"), "utf-8");

    // Layout is the outermost gate — non-admins must get a 404 (not a redirect
    // that would reveal the route exists) before any child page renders.
    expect(/isAdmin\(userId\)\)\s*notFound\(\)/.test(layout)).toBe(true);
    expect(/isAdmin\(userId\)\)\s*notFound\(\)/.test(invitesPage)).toBe(true);
    expect(/isAdmin\(userId\)\)\s*notFound\(\)/.test(reportsPage)).toBe(true);

    // Confirm redirect() is NOT used for non-admins in the layout.
    expect(/isAdmin\(userId\)\)\s*redirect\(/.test(layout)).toBe(false);
  });
});
