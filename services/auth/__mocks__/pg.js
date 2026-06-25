"use strict";

// In-memory store for test rows
const _store = { users: [], invite_requests: [], listings: [] };

function resetStore() {
  _store.users = [];
  _store.invite_requests = [];
  _store.listings = [];
}

function getStore() { return _store; }

function addUser(user) {
  _store.users.push({
    id: user.id || `user-${Date.now()}`,
    clerk_id: user.clerk_id || `clerk-${user.id}`,
    email: user.email,
    edu_verified: user.edu_verified ?? true,
    university: user.university || null,
    deleted_at: user.deleted_at || null,
    purge_after: user.purge_after || null,
    created_at: new Date(),
  });
}

function addListing(listing) {
  _store.listings.push({
    id: listing.id || `listing-${Date.now()}`,
    user_id: listing.user_id,
    status: listing.status || "active",
  });
}

// Minimal mock query engine
async function query(sql, params = []) {
  const s = sql.replace(/\s+/g, " ").trim().toLowerCase();

  // invite_requests INSERT
  if (s.startsWith("insert into invite_requests")) {
    const [email, university_name] = params;
    const dup = _store.invite_requests.find((r) => r.email === email);
    if (dup) { const e = new Error("duplicate"); e.code = "23505"; throw e; }
    const row = { id: `uuid-${Date.now()}`, email, university_name, status: "pending", redeemed_at: null, verification_token: null, created_at: new Date() };
    _store.invite_requests.push(row);
    return { rows: [row] };
  }

  // invite_requests SELECT by verification_token
  if (s.includes("from invite_requests where verification_token")) {
    const rows = _store.invite_requests.filter((r) => r.verification_token === params[0]);
    return { rows };
  }

  // invite_requests SELECT by id
  if (s.includes("from invite_requests where id")) {
    const rows = _store.invite_requests.filter((r) => r.id === params[0]);
    return { rows };
  }

  // invite_requests SELECT all
  if (s.includes("from invite_requests order by")) {
    return { rows: [..._store.invite_requests] };
  }

  // invite_requests UPDATE status=approved
  if (s.includes("set verification_token")) {
    const [token, id] = params;
    const row = _store.invite_requests.find((r) => r.id === id && r.status === "pending");
    if (!row) return { rows: [] };
    row.verification_token = token;
    row.status = "approved";
    return { rows: [row] };
  }

  // invite_requests UPDATE status=rejected
  if (s.includes("set status = 'rejected'")) {
    const [id] = params;
    const row = _store.invite_requests.find((r) => r.id === id && r.status === "pending");
    if (!row) return { rows: [] };
    row.status = "rejected";
    return { rows: [row] };
  }

  // invite_requests UPDATE status=redeemed
  if (s.includes("set status = 'redeemed'")) {
    const [id] = params;
    const row = _store.invite_requests.find((r) => r.id === id);
    if (row) { row.status = "redeemed"; row.redeemed_at = new Date(); }
    return { rows: row ? [row] : [] };
  }

  // users UPSERT
  if (s.startsWith("insert into users")) {
    const [clerk_id, email, edu_verified, university] = params;
    const existing = _store.users.find((u) => u.clerk_id === clerk_id);
    if (existing) {
      existing.email = email;
      existing.edu_verified = edu_verified;
      existing.university = university;
      return { rows: [existing] };
    }
    const row = {
      id: `user-${Date.now()}`, clerk_id, email, edu_verified, university,
      deleted_at: null, purge_after: null, created_at: new Date(),
    };
    _store.users.push(row);
    return { rows: [row] };
  }

  // users DELETE soft-delete (DELETE /me)
  if (s.startsWith("update users") && s.includes("set deleted_at = now()")) {
    const [clerk_id] = params;
    const row = _store.users.find((u) => u.clerk_id === clerk_id && !u.deleted_at);
    if (!row) return { rows: [] };
    row.deleted_at = new Date();
    row.purge_after = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    row.edu_verified = false;
    return { rows: [{ id: row.id, deleted_at: row.deleted_at, purge_after: row.purge_after }] };
  }

  // listings UPDATE status=paused (DELETE /me side effect)
  if (s.startsWith("update listings") && s.includes("set status = 'paused'")) {
    const [user_id] = params;
    _store.listings
      .filter((l) => l.user_id === user_id && (l.status === "active" || l.status === "draft"))
      .forEach((l) => { l.status = "paused"; });
    return { rows: [] };
  }

  // users SELECT due for purge
  if (s.includes("from users") && s.includes("deleted_at is not null") && s.includes("purge_after")) {
    const [limit] = params;
    const rows = _store.users
      .filter((u) => u.deleted_at && u.purge_after && u.purge_after <= new Date())
      .sort((a, b) => a.purge_after - b.purge_after)
      .slice(0, limit)
      .map((u) => ({ id: u.id, clerk_id: u.clerk_id }));
    return { rows };
  }

  // users DELETE (hard purge)
  if (s.startsWith("delete from users where id")) {
    const [id] = params;
    _store.users = _store.users.filter((u) => u.id !== id);
    return { rows: [] };
  }

  // users SELECT by clerk_id (full)
  if (s.includes("from users where clerk_id")) {
    let rows = _store.users.filter((u) => u.clerk_id === params[0]);
    if (s.includes("deleted_at is null")) {
      rows = rows.filter((u) => !u.deleted_at);
    }
    return { rows };
  }

  // users SELECT by internal id (used by getUserEmail)
  if (s.includes("from users where id")) {
    const rows = _store.users.filter((u) => u.id === params[0]);
    return { rows };
  }

  return { rows: [] };
}

class Pool {
  query(...args) { return query(...args); }
}

module.exports = { Pool, resetStore, getStore, addUser, addListing };
