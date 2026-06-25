"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const request = require("supertest");
const { app } = require("../index");
const { resetStore, getStore } = require("pg");
const clerkMock = require("@clerk/express");

beforeEach(() => {
  resetStore();
  process.env.INVITE_SECRET = "test-invite-secret";
  clerkMock.setUserId("clerk-user-1");
  clerkMock.resetClerkUsers();
  clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
});

// ─── GET /healthz ─────────────────────────────────────────────────────────────

describe("GET /healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("auth");
  });
});

// ─── POST /verify-edu ────────────────────────────────────────────────────────

describe("POST /verify-edu", () => {
  it("marks a .edu email as verified", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
    const res = await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.edu_verified).toBe(true);
    expect(typeof res.body.university).toBe("string");
  });

  it("marks a non-.edu email as not verified", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "user@gmail.com", verified: true });
    const res = await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.edu_verified).toBe(false);
    expect(res.body.university).toBeNull();
  });

  it("returns 400 when the Clerk primary email is not verified", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: false });
    const res = await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("ignores an attacker-supplied body email and uses the real Clerk-verified email", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
    const res = await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({ email: "attacker@harvard.edu" });
    expect(res.status).toBe(200);
    expect(getStore().users.length).toBe(1);
    expect(getStore().users[0].email).toBe("student@utexas.edu");
  });

  it("upserts if user already exists", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
    await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});
    // Second call (e.g. Clerk session refreshed)
    const res = await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});
    expect(res.status).toBe(200);
    // Only one user row in store after upsert
    expect(getStore().users.length).toBe(1);
  });
});

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe("GET /me", () => {
  it("returns user data for an existing user", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
    await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});

    const res = await request(app)
      .get("/me")
      .set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("student@utexas.edu");
    expect(res.body.edu_verified).toBe(true);
  });

  it("returns 404 when user does not exist", async () => {
    clerkMock.setUserId("unknown-clerk-id");
    const res = await request(app)
      .get("/me")
      .set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(404);
  });
});

// ─── GET /validate ────────────────────────────────────────────────────────────

describe("GET /validate", () => {
  it("returns user fields for an existing user", async () => {
    clerkMock.setClerkUser("clerk-user-1", { email: "verified@utexas.edu", verified: true });
    await request(app)
      .post("/verify-edu")
      .set("Authorization", "Bearer mock-token")
      .send({});

    const res = await request(app)
      .get("/validate")
      .set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(200);
    expect(res.body.edu_verified).toBe(true);
    expect(res.body.clerk_id).toBe("clerk-user-1");
  });

  it("returns 404 for unknown user", async () => {
    clerkMock.setUserId("nobody");
    const res = await request(app)
      .get("/validate")
      .set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(404);
  });
});
