"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const request = require("supertest");
const { app, purgeDeletedUsers } = require("../index");
const { resetStore, getStore, addUser, addListing } = require("pg");
const clerkMock = require("@clerk/express");

const INTERNAL_SECRET = "test-internal-secret";

beforeEach(() => {
  resetStore();
  process.env.INVITE_SECRET = "test-invite-secret";
  process.env.INTERNAL_SECRET = INTERNAL_SECRET;
  clerkMock.setUserId("clerk-user-1");
  clerkMock.resetClerkUsers();
  clerkMock.resetDeletedUserIds();
  clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
});

// ─── DELETE /me ───────────────────────────────────────────────────────────────

describe("DELETE /me", () => {
  // Real 401-without-a-valid-session behavior is enforced by Clerk's actual
  // requireAuth() in production and exercised at the gateway level — this
  // service's @clerk/express mock always authenticates the configured test
  // user, matching the pattern of every other route in this test suite.

  it("soft-deletes the user and returns deleted_at/purge_after", async () => {
    addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });

    const res = await request(app)
      .delete("/me")
      .set("Authorization", "Bearer mock-token");

    expect(res.status).toBe(200);
    expect(res.body.deleted_at).toBeTruthy();
    expect(res.body.purge_after).toBeTruthy();

    const stored = getStore().users.find((u) => u.id === "user-1");
    expect(stored.deleted_at).toBeTruthy();
    expect(stored.edu_verified).toBe(false);
  });

  it("pauses the user's active/draft listings", async () => {
    addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });
    addListing({ id: "listing-1", user_id: "user-1", status: "active" });
    addListing({ id: "listing-2", user_id: "user-1", status: "draft" });
    addListing({ id: "listing-3", user_id: "user-1", status: "leased" });

    await request(app).delete("/me").set("Authorization", "Bearer mock-token");

    const listings = getStore().listings;
    expect(listings.find((l) => l.id === "listing-1").status).toBe("paused");
    expect(listings.find((l) => l.id === "listing-2").status).toBe("paused");
    // leased listings are untouched
    expect(listings.find((l) => l.id === "listing-3").status).toBe("leased");
  });

  it("returns 404 on double-delete", async () => {
    addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });

    const first = await request(app).delete("/me").set("Authorization", "Bearer mock-token");
    expect(first.status).toBe(200);

    const second = await request(app).delete("/me").set("Authorization", "Bearer mock-token");
    expect(second.status).toBe(404);
  });

  it("returns 404 when the user does not exist", async () => {
    const res = await request(app).delete("/me").set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(404);
  });
});

// ─── Soft-deleted-user lookup exclusion ───────────────────────────────────────

describe("soft-deleted user exclusion from lookups", () => {
  it("GET /validate returns 404 for a soft-deleted user", async () => {
    addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });
    await request(app).delete("/me").set("Authorization", "Bearer mock-token");

    const res = await request(app).get("/validate").set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(404);
  });

  it("GET /me returns 404 for a soft-deleted user", async () => {
    addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });
    await request(app).delete("/me").set("Authorization", "Bearer mock-token");

    const res = await request(app).get("/me").set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(404);
  });

  it("returns 403 when a soft-deleted user attempts to re-verify their .edu email", async () => {
    addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });
    await request(app).delete("/me").set("Authorization", "Bearer mock-token");

    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
    const verifyRes = await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});
    expect(verifyRes.status).toBe(403);
    expect(verifyRes.body.error).toMatch(/deleted/i);

    // Account remains locked — deleted_at is intact, /validate still 404s
    const stored = getStore().users.find((u) => u.clerk_id === "clerk-user-1");
    expect(stored.deleted_at).toBeTruthy();
    const validateRes = await request(app).get("/validate").set("Authorization", "Bearer mock-token");
    expect(validateRes.status).toBe(404);
  });
});

// ─── purgeDeletedUsers ────────────────────────────────────────────────────────

describe("purgeDeletedUsers", () => {
  it("purges users whose purge_after has passed", async () => {
    addUser({
      id: "user-1",
      clerk_id: "clerk-user-1",
      email: "student@utexas.edu",
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      purge_after: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    });
    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });

    const result = await purgeDeletedUsers({ limit: 10 });

    expect(result.purged).toBe(1);
    expect(getStore().users.find((u) => u.id === "user-1")).toBeUndefined();
  });

  it("skips users not yet due for purge", async () => {
    addUser({
      id: "user-2",
      clerk_id: "clerk-user-2",
      email: "future@utexas.edu",
      deleted_at: new Date(),
      purge_after: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000), // 29 days from now
    });

    const result = await purgeDeletedUsers({ limit: 10 });

    expect(result.purged).toBe(0);
    expect(getStore().users.find((u) => u.id === "user-2")).toBeDefined();
  });

  it("calls Clerk's deleteUser with the right clerk_id", async () => {
    addUser({
      id: "user-3",
      clerk_id: "clerk-user-3",
      email: "gone@utexas.edu",
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      purge_after: new Date(Date.now() - 1000),
    });
    clerkMock.setClerkUser("clerk-user-3", { email: "gone@utexas.edu", verified: true });

    await purgeDeletedUsers({ limit: 10 });

    expect(clerkMock.getDeletedUserIds()).toContain("clerk-user-3");
  });

  it("handles a Clerk-delete failure gracefully without aborting the batch", async () => {
    addUser({
      id: "user-4",
      clerk_id: "clerk-user-4",
      email: "fail@utexas.edu",
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      purge_after: new Date(Date.now() - 1000),
    });
    addUser({
      id: "user-5",
      clerk_id: "clerk-user-5",
      email: "ok@utexas.edu",
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      purge_after: new Date(Date.now() - 1000),
    });
    clerkMock.setClerkUser("clerk-user-4", { email: "fail@utexas.edu", verified: true });
    clerkMock.setClerkUser("clerk-user-5", { email: "ok@utexas.edu", verified: true });
    clerkMock.setDeleteUserShouldFail("clerk-user-4");

    const result = await purgeDeletedUsers({ limit: 10 });

    expect(result.failed).toBe(1);
    expect(result.purged).toBe(1);
    // user-4 stays in the DB since its purge failed; user-5 is gone
    expect(getStore().users.find((u) => u.id === "user-4")).toBeDefined();
    expect(getStore().users.find((u) => u.id === "user-5")).toBeUndefined();
  });

  it("swallows a Clerk 'not found' error and still hard-deletes the row", async () => {
    addUser({
      id: "user-6",
      clerk_id: "clerk-user-6",
      email: "alreadygone@utexas.edu",
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      purge_after: new Date(Date.now() - 1000),
    });
    // Deliberately not calling setClerkUser, so getUser/deleteUser 404s.

    const result = await purgeDeletedUsers({ limit: 10 });

    expect(result.purged).toBe(1);
    expect(getStore().users.find((u) => u.id === "user-6")).toBeUndefined();
  });
});

// ─── POST /internal/purge-deleted ─────────────────────────────────────────────

describe("POST /internal/purge-deleted", () => {
  it("rejects without a valid X-Internal-Secret", async () => {
    const res = await request(app).post("/internal/purge-deleted").send({});
    expect(res.status).toBe(403);
  });

  it("rejects with a wrong X-Internal-Secret", async () => {
    const res = await request(app)
      .post("/internal/purge-deleted")
      .set("X-Internal-Secret", "wrong-secret")
      .send({});
    expect(res.status).toBe(403);
  });

  it("runs the purge when the correct X-Internal-Secret is presented", async () => {
    addUser({
      id: "user-7",
      clerk_id: "clerk-user-7",
      email: "due@utexas.edu",
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      purge_after: new Date(Date.now() - 1000),
    });
    clerkMock.setClerkUser("clerk-user-7", { email: "due@utexas.edu", verified: true });

    const res = await request(app)
      .post("/internal/purge-deleted")
      .set("X-Internal-Secret", INTERNAL_SECRET)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(1);
  });
});
