"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const request = require("supertest");
const { app } = require("../index");
const { resetStore, getStore } = require("pg");

const ADMIN_SECRET = "test-admin-secret";

beforeEach(() => {
  resetStore();
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  process.env.APP_URL = "http://localhost:3000";
  process.env.INVITE_SECRET = "test-invite-secret";
});

// ─── POST /invite-request ────────────────────────────────────────────────────

describe("POST /invite-request", () => {
  it("accepts a valid non-.edu email", async () => {
    const res = await request(app)
      .post("/invite-request")
      .send({ email: "student@gmail.com", university_name: "University of Texas" });
    expect(res.status).toBe(201);
    expect(res.body.queued).toBe(true);
  });

  it("rejects a .edu email", async () => {
    const res = await request(app)
      .post("/invite-request")
      .send({ email: "student@utexas.edu", university_name: "UT Austin" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\.edu/);
  });

  it("rejects missing email", async () => {
    const res = await request(app).post("/invite-request").send({ university_name: "MIT" });
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate email", async () => {
    await request(app)
      .post("/invite-request")
      .send({ email: "dupe@gmail.com", university_name: "NYU" });
    const res = await request(app)
      .post("/invite-request")
      .send({ email: "dupe@gmail.com", university_name: "NYU" });
    expect(res.status).toBe(409);
  });

  it("normalizes email to lowercase", async () => {
    await request(app)
      .post("/invite-request")
      .send({ email: "Upper@Gmail.COM", university_name: "NYU" });
    const store = getStore();
    expect(store.invite_requests[0].email).toBe("upper@gmail.com");
  });
});

// ─── GET /admin/invite-requests ──────────────────────────────────────────────

describe("GET /admin/invite-requests", () => {
  it("returns all invite requests to admin", async () => {
    await request(app).post("/invite-request").send({ email: "a@gmail.com" });
    const res = await request(app)
      .get("/admin/invite-requests")
      .set("x-admin-secret", ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it("returns 403 without admin secret", async () => {
    const res = await request(app).get("/admin/invite-requests");
    expect(res.status).toBe(403);
  });

  it("returns 403 with wrong secret", async () => {
    const res = await request(app)
      .get("/admin/invite-requests")
      .set("x-admin-secret", "wrong");
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /admin/invite-requests/:id ───────────────────────────────────────

describe("PATCH /admin/invite-requests/:id", () => {
  async function seedPending() {
    await request(app).post("/invite-request").send({ email: "pending@gmail.com", university_name: "NYU" });
    return getStore().invite_requests[0].id;
  }

  it("approves a pending invite and returns a magic link", async () => {
    const id = await seedPending();
    const res = await request(app)
      .patch(`/admin/invite-requests/${id}`)
      .set("x-admin-secret", ADMIN_SECRET)
      .send({ action: "approve" });
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
    expect(res.body.magic_link).toMatch(/\/signup\?token=/);
  });

  it("rejects a pending invite", async () => {
    const id = await seedPending();
    const res = await request(app)
      .patch(`/admin/invite-requests/${id}`)
      .set("x-admin-secret", ADMIN_SECRET)
      .send({ action: "reject" });
    expect(res.status).toBe(200);
    expect(res.body.rejected).toBe(true);
  });

  it("returns 400 for invalid action", async () => {
    const id = await seedPending();
    const res = await request(app)
      .patch(`/admin/invite-requests/${id}`)
      .set("x-admin-secret", ADMIN_SECRET)
      .send({ action: "delete" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when invite not found or not pending", async () => {
    const res = await request(app)
      .patch("/admin/invite-requests/nonexistent-id")
      .set("x-admin-secret", ADMIN_SECRET)
      .send({ action: "approve" });
    expect(res.status).toBe(404);
  });

  it("returns 403 without admin secret", async () => {
    const id = await seedPending();
    const res = await request(app)
      .patch(`/admin/invite-requests/${id}`)
      .send({ action: "approve" });
    expect(res.status).toBe(403);
  });
});

// ─── GET /invite-request/verify ──────────────────────────────────────────────

describe("GET /invite-request/verify", () => {
  async function seedApproved() {
    await request(app).post("/invite-request").send({ email: "inv@gmail.com", university_name: "NYU" });
    const id = getStore().invite_requests[0].id;
    await request(app)
      .patch(`/admin/invite-requests/${id}`)
      .set("x-admin-secret", ADMIN_SECRET)
      .send({ action: "approve" });
    const token = getStore().invite_requests[0].verification_token;
    return { id, token };
  }

  it("returns email, university_name, and signed_token for valid token", async () => {
    const { token } = await seedApproved();
    const res = await request(app).get(`/invite-request/verify?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("inv@gmail.com");
    expect(res.body.university_name).toBe("NYU");
    expect(typeof res.body.signed_token).toBe("string");
  });

  it("returns 404 for unknown token", async () => {
    const res = await request(app).get("/invite-request/verify?token=badtoken");
    expect(res.status).toBe(404);
  });

  it("returns 400 when token query param is missing", async () => {
    const res = await request(app).get("/invite-request/verify");
    expect(res.status).toBe(400);
  });
});
