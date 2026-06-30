"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const request = require("supertest");
const { app } = require("../index");
const { resetStore, addUser } = require("pg");
const clerkMock = require("@clerk/express");

// Seed a user in the pg mock store so the /profile endpoint does not
// short-circuit with a 404 before it reaches field validation.
beforeEach(() => {
  resetStore();
  process.env.INVITE_SECRET = "test-invite-secret";
  clerkMock.setUserId("clerk-user-1");
  clerkMock.resetClerkUsers();
  clerkMock.setClerkUser("clerk-user-1", { email: "student@utexas.edu", verified: true });
  addUser({ id: "user-1", clerk_id: "clerk-user-1", email: "student@utexas.edu" });
});

// A payload that satisfies every validation rule.
const VALID_PAYLOAD = {
  vibe_text: "quiet place near campus",
  university: "UT Austin",
  max_rent_cents: 150000,
  min_bedrooms: 2,
};

// ─── POST /profile — field-level validation ───────────────────────────────────

describe("POST /profile field validation (Fix 5)", () => {
  // ── vibe_text ────────────────────────────────────────────────────────────────

  it("returns 400 when vibe_text exceeds 2000 characters", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, vibe_text: "a".repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vibe_text/);
  });

  it("returns 400 when vibe_text is not a string (number)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, vibe_text: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vibe_text/);
  });

  // ── university ───────────────────────────────────────────────────────────────

  it("returns 400 when university exceeds 200 characters", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, university: "u".repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/university/);
  });

  it("returns 400 when university is not a string (number)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, university: 99 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/university/);
  });

  // ── max_rent_cents ───────────────────────────────────────────────────────────

  it("returns 400 when max_rent_cents is -1 (negative)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, max_rent_cents: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max_rent_cents/);
  });

  it("returns 400 when max_rent_cents is 9999 (below 10000 minimum)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, max_rent_cents: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max_rent_cents/);
  });

  it("returns 400 when max_rent_cents is 5000001 (above 5000000 maximum)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, max_rent_cents: 5000001 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max_rent_cents/);
  });

  it("returns 400 when max_rent_cents is a non-integer float", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, max_rent_cents: 150000.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max_rent_cents/);
  });

  // ── min_bedrooms ─────────────────────────────────────────────────────────────

  it("returns 400 when min_bedrooms is -1 (negative)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, min_bedrooms: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/min_bedrooms/);
  });

  it("returns 400 when min_bedrooms is 21 (above 20 maximum)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, min_bedrooms: 21 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/min_bedrooms/);
  });

  it("returns 400 when min_bedrooms is a non-integer float", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, min_bedrooms: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/min_bedrooms/);
  });

  // ── boundary / happy-path ────────────────────────────────────────────────────

  it("accepts max_rent_cents at exactly the minimum (10000)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, max_rent_cents: 10000 });
    // Validation passes; DB mock may return empty rows causing non-400 status
    expect(res.status).not.toBe(400);
  });

  it("accepts max_rent_cents at exactly the maximum (5000000)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, max_rent_cents: 5000000 });
    expect(res.status).not.toBe(400);
  });

  it("accepts min_bedrooms at exactly 0 (allowed lower bound)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, min_bedrooms: 0 });
    expect(res.status).not.toBe(400);
  });

  it("accepts min_bedrooms at exactly 20 (allowed upper bound)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send({ ...VALID_PAYLOAD, min_bedrooms: 20 });
    expect(res.status).not.toBe(400);
  });

  it("does not return 400 for a fully valid payload (gets past all validation)", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Authorization", "Bearer mock-token")
      .send(VALID_PAYLOAD);
    // Passes validation — may 500 because pg mock returns no user_profiles rows,
    // but must never 400.
    expect(res.status).not.toBe(400);
  });
});
