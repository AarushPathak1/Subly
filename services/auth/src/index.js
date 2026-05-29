const express = require("express");
const { clerkMiddleware, requireAuth, getAuth } = require("@clerk/express");
const { Pool } = require("pg");
const amqp = require("amqplib");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(clerkMiddleware());

// ─── Database ────────────────────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── RabbitMQ ────────────────────────────────────────────────────────────────
let channel;
async function connectMQ() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await conn.createChannel();
  await channel.assertQueue("user.registered", { durable: true });
  console.log("[auth] RabbitMQ connected");
}
connectMQ().catch(console.error);

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get("/healthz", (req, res) => {
  res.json({ status: "ok", service: "auth" });
});

/**
 * POST /verify-edu
 * Called after Clerk webhook confirms email. Checks if the email domain
 * ends with .edu and marks the user as edu_verified in our DB.
 */
app.post("/verify-edu", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  try {
    // Clerk stores the primary email on the session claims
    const email = req.body.email;
    if (!email) {
      return res.status(400).json({ error: "email required" });
    }

    const isEdu = email.toLowerCase().endsWith(".edu");
    const university = isEdu ? lookupUniversity(email) : null;

    await db.query(
      `INSERT INTO users (clerk_id, email, edu_verified, university)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_id) DO UPDATE
         SET edu_verified = $3, university = $4, updated_at = NOW()`,
      [userId, email, isEdu, university]
    );

    if (isEdu && channel) {
      channel.sendToQueue(
        "user.registered",
        Buffer.from(JSON.stringify({ userId, email, university })),
        { persistent: true }
      );
    }

    res.json({ edu_verified: isEdu, university });
  } catch (err) {
    console.error("[auth] verify-edu error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /validate
 * Called by the Gateway to verify a Clerk session and return edu_verified status.
 */
app.get("/validate", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  try {
    const { rows } = await db.query(
      "SELECT id, clerk_id, edu_verified FROM users WHERE clerk_id = $1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("[auth] /validate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /me
 * Returns the current user's profile from our DB.
 */
app.get("/me", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  try {
    const { rows } = await db.query(
      "SELECT id, clerk_id, email, edu_verified, university, created_at FROM users WHERE clerk_id = $1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("[auth] /me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /profile
 * Returns the current user's vibe preferences from user_profiles.
 */
app.get("/profile", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  try {
    const { rows: userRows } = await db.query(
      "SELECT id FROM users WHERE clerk_id = $1",
      [userId]
    );
    if (!userRows.length) return res.status(404).json({ error: "User not found" });

    const { rows } = await db.query(
      `SELECT id, vibe_text, university, max_rent_cents, min_bedrooms
       FROM user_profiles WHERE user_id = $1`,
      [userRows[0].id]
    );
    if (!rows.length) return res.status(404).json({ error: "Profile not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("[auth] /profile GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /profile
 * Upserts vibe preferences for the current user.
 */
app.post("/profile", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  try {
    const { rows: userRows } = await db.query(
      "SELECT id FROM users WHERE clerk_id = $1",
      [userId]
    );
    if (!userRows.length) return res.status(404).json({ error: "User not found" });

    const { vibe_text, university, max_rent_cents, min_bedrooms } = req.body;
    const { rows } = await db.query(
      `INSERT INTO user_profiles (user_id, vibe_text, university, max_rent_cents, min_bedrooms)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET vibe_text = $2, university = $3, max_rent_cents = $4,
             min_bedrooms = $5, updated_at = NOW()
       RETURNING id`,
      [userRows[0].id, vibe_text, university, max_rent_cents, min_bedrooms]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    console.error("[auth] /profile POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /invite-request
 * Public endpoint. Accepts non-.edu email + university, queues an invite request.
 * Returns 400 if the email ends in .edu (use main signup instead).
 * Returns 409 if the email is already on the list.
 */
app.post("/invite-request", async (req, res) => {
  const { email, university_name } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email required" });
  }

  if (email.trim().toLowerCase().endsWith(".edu")) {
    return res.status(400).json({
      error: "You have a .edu address — sign up directly instead!",
    });
  }

  try {
    await db.query(
      `INSERT INTO invite_requests (email, university_name)
       VALUES ($1, $2)`,
      [email.trim().toLowerCase(), university_name?.trim() ?? null]
    );
    res.status(201).json({ queued: true });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Already on the list" });
    }
    console.error("[auth] /invite-request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /admin/invite-requests
 * Admin only (X-Admin-Secret header). Returns all invite requests.
 */
app.get("/admin/invite-requests", (req, res, next) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, university_name, status, redeemed_at, created_at
       FROM invite_requests ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("[auth] /admin/invite-requests error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /admin/invite-requests/:id
 * Admin only (X-Admin-Secret header). Approves or rejects a pending invite.
 * Body: { action: 'approve' | 'reject' }
 */
app.patch("/admin/invite-requests/:id", (req, res, next) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
  }

  try {
    if (action === "reject") {
      const { rows } = await db.query(
        `UPDATE invite_requests SET status = 'rejected', updated_at = NOW()
         WHERE id = $1 AND status = 'pending' RETURNING email`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: "Pending invite not found" });
      return res.json({ rejected: true, email: rows[0].email });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const { rows } = await db.query(
      `UPDATE invite_requests
       SET verification_token = $1, status = 'approved', updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING email, university_name`,
      [token, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Pending invite not found" });

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    res.json({
      approved: true,
      email: rows[0].email,
      university_name: rows[0].university_name,
      magic_link: `${baseUrl}/signup?token=${token}`,
    });
  } catch (err) {
    console.error("[auth] /admin/invite-requests/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /invite-request/verify?token=xxx
 * Public. Validates a verification_token and returns a short-lived signed token
 * the frontend uses to authorise the redemption step.
 */
app.get("/invite-request/verify", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token required" });

  try {
    const { rows } = await db.query(
      `SELECT id, email, university_name, status, redeemed_at
       FROM invite_requests WHERE verification_token = $1`,
      [token]
    );

    if (!rows.length) return res.status(404).json({ error: "Invalid or expired invite link" });
    const invite = rows[0];

    if (invite.status !== "approved") {
      return res.status(400).json({ error: "This invite has not been approved yet" });
    }
    if (invite.redeemed_at) {
      return res.status(400).json({ error: "This invite link has already been used" });
    }

    const signedToken = createSignedToken(invite.id);
    res.json({ email: invite.email, university_name: invite.university_name, signed_token: signedToken });
  } catch (err) {
    console.error("[auth] /invite-request/verify error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /invite-request/redeem
 * Authenticated. Verifies the signed token, inserts the user with edu_verified=true,
 * and marks the invite as redeemed (single-use).
 */
app.post("/invite-request/redeem", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  const { signed_token } = req.body;

  if (!signed_token) return res.status(400).json({ error: "signed_token required" });

  const inviteId = verifySignedToken(signed_token);
  if (!inviteId) return res.status(400).json({ error: "Signed token is invalid or has expired" });

  try {
    const { rows } = await db.query(
      `SELECT id, email, university_name, status, redeemed_at
       FROM invite_requests WHERE id = $1`,
      [inviteId]
    );

    if (!rows.length) return res.status(404).json({ error: "Invite not found" });
    const invite = rows[0];

    if (invite.status !== "approved") return res.status(400).json({ error: "Invite not approved" });
    if (invite.redeemed_at) return res.status(409).json({ error: "Invite already redeemed" });

    await db.query(
      `INSERT INTO users (clerk_id, email, edu_verified, university)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (clerk_id) DO UPDATE
         SET edu_verified = TRUE, university = $3, updated_at = NOW()`,
      [userId, invite.email, invite.university_name]
    );

    await db.query(
      `UPDATE invite_requests
       SET status = 'redeemed', redeemed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [inviteId]
    );

    res.json({ success: true, university: invite.university_name });
  } catch (err) {
    console.error("[auth] /invite-request/redeem error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const { deriveUniversity } = require("./utils");
const universityDomainMap = require("./university-domain-map.json");

function lookupUniversity(email) {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  // Try exact domain match first, then strip subdomains progressively
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (universityDomainMap[candidate]) return universityDomainMap[candidate];
  }
  // Fall back to the old uppercased abbreviation so we always return something
  return deriveUniversity(email);
}

function createSignedToken(inviteId) {
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
  const payload = `${inviteId}:${expiresAt}`;
  const secret = process.env.INVITE_SECRET || "dev-invite-secret-change-in-prod";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifySignedToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    // format: inviteId:expiresAt:sig  (UUID has no colons, expiresAt is digits)
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [inviteId, expiresAtStr, sig] = parts;
    if (Date.now() > parseInt(expiresAtStr, 10)) return null;
    const secret = process.env.INVITE_SECRET || "dev-invite-secret-change-in-prod";
    const expected = crypto.createHmac("sha256", secret)
      .update(`${inviteId}:${expiresAtStr}`)
      .digest("hex");
    if (sig !== expected) return null;
    return inviteId;
  } catch {
    return null;
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[auth] listening on :${PORT}`));
