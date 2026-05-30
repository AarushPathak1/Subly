"use strict";

// In-memory store for test rows
const _store = { users: [], invite_requests: [] };

function resetStore() {
  _store.users = [];
  _store.invite_requests = [];
}

function getStore() { return _store; }

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
      existing.edu_verified = edu_verified;
      existing.university = university;
      return { rows: [existing] };
    }
    const row = { id: `user-${Date.now()}`, clerk_id, email, edu_verified, university, created_at: new Date() };
    _store.users.push(row);
    return { rows: [row] };
  }

  // users SELECT by clerk_id (full)
  if (s.includes("from users where clerk_id")) {
    const rows = _store.users.filter((u) => u.clerk_id === params[0]);
    return { rows };
  }

  return { rows: [] };
}

class Pool {
  query(...args) { return query(...args); }
}

module.exports = { Pool, resetStore, getStore };
