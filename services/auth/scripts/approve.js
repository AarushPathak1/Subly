#!/usr/bin/env node
"use strict";

/**
 * Admin-only CLI to approve a pending invite request.
 * Run inside the container:
 *   docker exec subly-auth node scripts/approve.js <invite_request_id>
 *
 * To list pending requests first:
 *   docker exec subly-postgres psql -U subly -d subly \
 *     -c "SELECT id, email, university_name, created_at FROM invite_requests WHERE status = 'pending' ORDER BY created_at;"
 */

const { Pool } = require("pg");
const crypto = require("crypto");

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: node scripts/approve.js <invite_request_id>");
    process.exit(1);
  }

  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const token = crypto.randomBytes(32).toString("hex");

    const { rows } = await db.query(
      `UPDATE invite_requests
       SET verification_token = $1, status = 'approved', updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING email, university_name`,
      [token, id]
    );

    if (!rows.length) {
      console.error("No pending invite request found with that ID.");
      process.exit(1);
    }

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    console.log(`\nApproved: ${rows[0].email} (${rows[0].university_name ?? "unknown university"})`);
    console.log(`\nMagic Link (send this to the user):\n${baseUrl}/signup?token=${token}\n`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
