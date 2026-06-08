const express = require("express");
const { clerkMiddleware, requireAuth, getAuth } = require("@clerk/express");
const { Pool } = require("pg");
const amqp = require("amqplib");
const crypto = require("crypto");
const { Resend } = require("resend");
const { lookupUniversity, createSignedToken, verifySignedToken } = require("./helpers");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const FROM = process.env.FROM_EMAIL || "Subly <onboarding@resend.dev>";

async function getUserEmail(userId) {
  const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
  return rows[0]?.email ?? null;
}

async function sendNewMessageEmail({ recipientId, listingTitle, conversationId }) {
  if (!resend) return;
  const to = await getUserEmail(recipientId);
  if (!to) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `New message about "${listingTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="margin-bottom:28px">
          <span style="font-size:22px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px">Subly</span>
        </div>
        <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px">You have a new message</h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px">
          Someone sent you a message about <strong>${listingTitle}</strong>. Reply to keep the conversation going.
        </p>
        <a href="${APP_URL}/messages/${conversationId}"
          style="display:inline-block;padding:14px 28px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">
          View message →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px;line-height:1.5">
          You're receiving this because you have an active conversation on Subly.
        </p>
      </div>
    `,
  });
  console.log(`[auth] new message email sent to ${to}`);
}

async function sendMatchConfirmedEmail({ listerId, renterId, listingTitle, conversationId, includesAgreement }) {
  if (!resend) return;
  const [listerEmail, renterEmail] = await Promise.all([
    getUserEmail(listerId),
    getUserEmail(renterId),
  ]);

  const agreementNote = includesAgreement
    ? `<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px">Your sublease agreement has been generated and is available in the conversation.</p>`
    : "";

  if (listerEmail) {
    await resend.emails.send({
      from: FROM,
      to: listerEmail,
      subject: `Match confirmed for "${listingTitle}"`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
          <div style="margin-bottom:28px">
            <span style="font-size:22px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px">Subly</span>
          </div>
          <div style="width:48px;height:48px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;margin-bottom:20px">
            <span style="font-size:24px">✓</span>
          </div>
          <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px">Match confirmed — payment received</h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
            Your match for <strong>${listingTitle}</strong> is confirmed. The renter has been notified.
          </p>
          ${agreementNote}
          <a href="${APP_URL}/messages/${conversationId}"
            style="display:inline-block;padding:14px 28px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">
            View conversation →
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:32px;line-height:1.5">
            You're receiving this because you confirmed a match on Subly.
          </p>
        </div>
      `,
    });
    console.log(`[auth] match confirmed email sent to lister ${listerEmail}`);
  }

  if (renterEmail) {
    await resend.emails.send({
      from: FROM,
      to: renterEmail,
      subject: `Great news — your match is confirmed!`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
          <div style="margin-bottom:28px">
            <span style="font-size:22px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px">Subly</span>
          </div>
          <div style="width:48px;height:48px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;margin-bottom:20px">
            <span style="font-size:24px">✓</span>
          </div>
          <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px">Your sublease match is confirmed</h1>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
            The lister has officially confirmed your match for <strong>${listingTitle}</strong>. Reach out to coordinate next steps.
          </p>
          ${agreementNote}
          <a href="${APP_URL}/messages/${conversationId}"
            style="display:inline-block;padding:14px 28px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">
            View conversation →
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:32px;line-height:1.5">
            You're receiving this because you have a confirmed sublease match on Subly.
          </p>
        </div>
      `,
    });
    console.log(`[auth] match confirmed email sent to renter ${renterEmail}`);
  }
}

async function sendListingExpiredEmail({ listerId, listingId, listingTitle }) {
  if (!resend) return;
  const to = await getUserEmail(listerId);
  if (!to) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your listing "${listingTitle}" has expired`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="margin-bottom:28px">
          <span style="font-size:22px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px">Subly</span>
        </div>
        <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px">Your listing has expired</h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px">
          <strong>${listingTitle}</strong> has passed its available-until date and is no longer visible to renters.
          If you're still looking for someone, update the dates and repost it — it only takes a minute.
        </p>
        <a href="${APP_URL}/listings/${listingId}/edit"
          style="display:inline-block;padding:14px 28px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">
          Repost listing →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px;line-height:1.5">
          You're receiving this because you have a listing on Subly.
        </p>
      </div>
    `,
  });
  console.log(`[auth] listing expired email sent to ${to}`);
}

async function consumeNotifications(ch) {
  await ch.assertQueue("notifications.new_message", { durable: true });
  await ch.assertQueue("notifications.match_confirmed", { durable: true });
  await ch.assertQueue("notifications.listing_expired", { durable: true });

  ch.consume("notifications.new_message", async (msg) => {
    if (!msg) return;
    try {
      const { recipient_id, listing_title, conversation_id } = JSON.parse(msg.content.toString());
      await sendNewMessageEmail({ recipientId: recipient_id, listingTitle: listing_title, conversationId: conversation_id });
    } catch (err) {
      console.error("[auth] new_message notification error:", err);
    } finally {
      ch.ack(msg);
    }
  });

  ch.consume("notifications.match_confirmed", async (msg) => {
    if (!msg) return;
    try {
      const { lister_id, renter_id, listing_title, conversation_id, includes_agreement } = JSON.parse(msg.content.toString());
      await sendMatchConfirmedEmail({ listerId: lister_id, renterId: renter_id, listingTitle: listing_title, conversationId: conversation_id, includesAgreement: includes_agreement });
    } catch (err) {
      console.error("[auth] match_confirmed notification error:", err);
    } finally {
      ch.ack(msg);
    }
  });

  ch.consume("notifications.listing_expired", async (msg) => {
    if (!msg) return;
    try {
      const { lister_id, listing_id, listing_title } = JSON.parse(msg.content.toString());
      await sendListingExpiredEmail({ listerId: lister_id, listingId: listing_id, listingTitle: listing_title });
    } catch (err) {
      console.error("[auth] listing_expired notification error:", err);
    } finally {
      ch.ack(msg);
    }
  });

  console.log("[auth] notification consumers registered");
}

async function sendInviteEmail({ to, universityName, magicLink }) {
  if (!resend) {
    console.log(`[auth] RESEND_API_KEY not set — magic link for ${to}: ${magicLink}`);
    return;
  }
  const from = process.env.FROM_EMAIL || "Subly <invites@subly.app>";
  await resend.emails.send({
    from,
    to,
    subject: "Your Subly invite is ready",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="margin-bottom:28px">
          <span style="font-size:22px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px">Subly</span>
        </div>
        <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px">You're in.</h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px">
          Your request to join Subly${universityName ? ` for <strong>${universityName}</strong>` : ""} has been approved.
          Click the button below to create your account — this link expires in <strong>30 minutes</strong>.
        </p>
        <a href="${magicLink}"
          style="display:inline-block;padding:14px 28px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">
          Create my account →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px;line-height:1.5">
          If you didn't request this, you can safely ignore this email.<br>
          Link expires 30 minutes after this email was sent.
        </p>
      </div>
    `,
  });
  console.log(`[auth] invite email sent to ${to}`);
}

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
  await consumeNotifications(channel);
  console.log("[auth] RabbitMQ connected");
}

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
    const magicLink = `${baseUrl}/signup?token=${token}`;

    // Fire-and-forget — don't block the HTTP response on email delivery
    sendInviteEmail({
      to: rows[0].email,
      universityName: rows[0].university_name,
      magicLink,
    }).catch((err) => console.error("[auth] invite email failed:", err));

    res.json({
      approved: true,
      email: rows[0].email,
      university_name: rows[0].university_name,
      magic_link: magicLink,
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

// ─── Start ───────────────────────────────────────────────────────────────────
if (require.main === module) {
  connectMQ().catch(console.error);
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`[auth] listening on :${PORT}`));
}

module.exports = { app, db, connectMQ, getChannel: () => channel };
