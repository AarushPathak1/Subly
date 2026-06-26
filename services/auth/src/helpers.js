"use strict";

const crypto = require("crypto");
const { deriveUniversity } = require("./utils");
const universityDomainMap = require("./university-domain-map.json");

/**
 * Resolves a .edu email domain to a canonical university name.
 * Tries progressively shorter domain suffixes so subdomain emails work.
 * Falls back to the abbreviated uppercase key from deriveUniversity().
 */
function lookupUniversity(email) {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (universityDomainMap[candidate]) return universityDomainMap[candidate];
  }
  return deriveUniversity(email);
}

/**
 * Creates a short-lived HMAC-signed token encoding the invite ID.
 * Format (base64url): inviteId:expiresAt:sig
 * Expires in 30 minutes by default.
 */
function createSignedToken(inviteId, ttlMs = 30 * 60 * 1000) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${inviteId}:${expiresAt}`;
  const secret = process.env.INVITE_SECRET || "dev-invite-secret-change-in-prod";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/**
 * Verifies a signed token. Returns the inviteId on success, null on failure.
 * Rejects expired tokens and tampered signatures.
 */
function verifySignedToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [inviteId, expiresAtStr, sig] = parts;
    if (Date.now() > parseInt(expiresAtStr, 10)) return null;
    const secret = process.env.INVITE_SECRET || "dev-invite-secret-change-in-prod";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${inviteId}:${expiresAtStr}`)
      .digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    return inviteId;
  } catch {
    return null;
  }
}

module.exports = { lookupUniversity, createSignedToken, verifySignedToken };
