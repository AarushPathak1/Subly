"use strict";

const { lookupUniversity, createSignedToken, verifySignedToken } = require("../helpers");

describe("lookupUniversity", () => {
  it("resolves a known domain", () => {
    // UT Austin maps to a real name in the domain map
    const result = lookupUniversity("student@utexas.edu");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("strips subdomains and still resolves", () => {
    const withSub = lookupUniversity("user@mail.utexas.edu");
    const direct = lookupUniversity("user@utexas.edu");
    expect(withSub).toBe(direct);
  });

  it("falls back to deriveUniversity for unknown domains", () => {
    const result = lookupUniversity("user@fakeschool.edu");
    expect(result).toBe("FAKESCHOOL");
  });

  it("is case-insensitive on the domain", () => {
    const lower = lookupUniversity("user@UCLA.edu");
    const upper = lookupUniversity("user@ucla.edu");
    expect(lower).toBe(upper);
  });
});

describe("createSignedToken", () => {
  const inviteId = "550e8400-e29b-41d4-a716-446655440000";

  it("returns a non-empty base64url string", () => {
    const token = createSignedToken(inviteId);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
    // base64url chars only
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("includes the inviteId and an expiry timestamp", () => {
    const before = Date.now();
    const token = createSignedToken(inviteId);
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [id, expiresAtStr] = decoded.split(":");
    expect(id).toBe(inviteId);
    expect(Number(expiresAtStr)).toBeGreaterThan(before);
  });

  it("respects a custom TTL", () => {
    const before = Date.now();
    const token = createSignedToken(inviteId, 5000);
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const expiresAt = Number(decoded.split(":")[1]);
    expect(expiresAt).toBeLessThan(before + 10000);
  });

  it("produces different tokens on each call (unique timestamps)", async () => {
    const t1 = createSignedToken(inviteId);
    await new Promise((r) => setTimeout(r, 2));
    const t2 = createSignedToken(inviteId);
    expect(t1).not.toBe(t2);
  });
});

describe("verifySignedToken", () => {
  const inviteId = "550e8400-e29b-41d4-a716-446655440000";

  it("returns the inviteId for a valid token", () => {
    const token = createSignedToken(inviteId);
    expect(verifySignedToken(token)).toBe(inviteId);
  });

  it("returns null for a tampered token", () => {
    const token = createSignedToken(inviteId);
    const tampered = token.slice(0, -3) + "AAA";
    expect(verifySignedToken(tampered)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = createSignedToken(inviteId, -1000); // already expired
    expect(verifySignedToken(token)).toBeNull();
  });

  it("returns null for a completely invalid string", () => {
    expect(verifySignedToken("not-a-token")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(verifySignedToken("")).toBeNull();
  });

  it("returns null when the secret is wrong", () => {
    const original = process.env.INVITE_SECRET;
    process.env.INVITE_SECRET = "secret-a";
    const token = createSignedToken(inviteId);
    process.env.INVITE_SECRET = "secret-b";
    const result = verifySignedToken(token);
    process.env.INVITE_SECRET = original;
    expect(result).toBeNull();
  });

  it("returns null when the signature has a different length than expected (constant-time check)", () => {
    const token = createSignedToken(inviteId);
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [id, expiresAtStr] = decoded.split(":");
    const shortSigToken = Buffer.from(`${id}:${expiresAtStr}:abcd`).toString("base64url");
    expect(verifySignedToken(shortSigToken)).toBeNull();
  });

  it("uses crypto.timingSafeEqual for signature comparison", () => {
    const spy = jest.spyOn(require("crypto"), "timingSafeEqual");
    const token = createSignedToken(inviteId);
    verifySignedToken(token);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
