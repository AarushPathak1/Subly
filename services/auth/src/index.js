const express = require("express");
const { clerkMiddleware, requireAuth, getAuth } = require("@clerk/express");
const { Pool } = require("pg");
const amqp = require("amqplib");

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
    const university = isEdu ? deriveUniversity(email) : null;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function deriveUniversity(email) {
  const domain = email.split("@")[1] || "";
  // e.g. "asu.edu" → "asu", "mail.utexas.edu" → "utexas"
  const parts = domain.replace(/\.edu$/, "").split(".");
  return parts[parts.length - 1].toUpperCase();
}

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[auth] listening on :${PORT}`));
