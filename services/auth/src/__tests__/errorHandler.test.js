"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const request = require("supertest");
const { app } = require("../index");

// The global error handler is registered as the last `app.use` at module
// load time, so routes added afterwards (as in these tests) land later in
// Express's middleware stack — after the error handler — and would never
// reach it on `next(err)`. Move each test route's layer to sit just before
// the error handler layer so it's exercised the same way real routes are.
function registerBeforeErrorHandler(path, handler) {
  app.get(path, handler);
  const stack = app._router.stack;
  const idx = stack.findIndex((l) => l.route && l.route.path === path);
  const layer = stack.splice(idx, 1)[0];
  stack.splice(stack.length - 1, 0, layer);
}

describe("global error handler", () => {
  it("returns 500 with a generic error body when next(err) is called", async () => {
    registerBeforeErrorHandler("/__test/next-error", (req, res, next) => {
      next(new Error("boom"));
    });

    const res = await request(app).get("/__test/next-error");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });

  it("returns 500 with a generic error body when a route throws synchronously", async () => {
    registerBeforeErrorHandler("/__test/throw-error", (req, res) => {
      throw new Error("boom");
    });

    const res = await request(app).get("/__test/throw-error");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});
