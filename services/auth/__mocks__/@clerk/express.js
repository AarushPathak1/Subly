"use strict";

let _userId = "test-user-id";

// Maps clerkUserId -> Clerk user object as returned by clerkClient.users.getUser
const _clerkUsers = new Map();

function setUserId(id) { _userId = id; }
function getTestUserId() { return _userId; }

/**
 * Configures the mock "Clerk user" returned by clerkClient.users.getUser(userId).
 * { email, verified = true } describes the primary email address and its verification status.
 * If no config is set for a userId, getUser() throws a Clerk-style "not found" error.
 */
function setClerkUser(userId, { email, verified = true } = {}) {
  _clerkUsers.set(userId, {
    id: userId,
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [
      {
        id: "idn_primary",
        emailAddress: email,
        verification: { status: verified ? "verified" : "unverified" },
      },
    ],
  });
}

function resetClerkUsers() { _clerkUsers.clear(); }

// Tracks deleteUser() calls so tests can assert on the right userId being deleted.
let _deletedUserIds = [];
// Lets tests force deleteUser() to throw for a specific userId (e.g. to
// simulate a Clerk-side failure other than "not found").
let _deleteUserFailures = new Set();

function getDeletedUserIds() { return _deletedUserIds; }
function resetDeletedUserIds() { _deletedUserIds = []; }
function setDeleteUserShouldFail(userId) { _deleteUserFailures.add(userId); }

const clerkMiddleware = () => (req, res, next) => next();

const requireAuth = () => (req, res, next) => {
  req.auth = { userId: _userId };
  next();
};

const getAuth = (req) => ({ userId: req.auth?.userId ?? _userId });

const clerkClient = {
  users: {
    async getUser(userId) {
      const user = _clerkUsers.get(userId);
      if (!user) {
        const err = new Error("User not found");
        err.status = 404;
        throw err;
      }
      return user;
    },
    async deleteUser(userId) {
      if (_deleteUserFailures.has(userId)) {
        throw new Error("Clerk deleteUser failed");
      }
      if (!_clerkUsers.has(userId)) {
        const err = new Error("User not found");
        err.status = 404;
        throw err;
      }
      _deletedUserIds.push(userId);
      _clerkUsers.delete(userId);
      return { id: userId, deleted: true };
    },
  },
};

module.exports = {
  clerkMiddleware,
  requireAuth,
  getAuth,
  clerkClient,
  setUserId,
  getTestUserId,
  setClerkUser,
  resetClerkUsers,
  getDeletedUserIds,
  resetDeletedUserIds,
  setDeleteUserShouldFail,
};
