"use strict";

let _userId = "test-user-id";

function setUserId(id) { _userId = id; }
function getTestUserId() { return _userId; }

const clerkMiddleware = () => (req, res, next) => next();

const requireAuth = () => (req, res, next) => {
  req.auth = { userId: _userId };
  next();
};

const getAuth = (req) => ({ userId: req.auth?.userId ?? _userId });

module.exports = { clerkMiddleware, requireAuth, getAuth, setUserId, getTestUserId };
