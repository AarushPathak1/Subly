"use strict";

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/__tests__/**/*.test.js"],
  clearMocks: true,
  // Automatically use manual mocks from __mocks__ at project root
  // (Jest resolves __mocks__ adjacent to node_modules automatically for node_modules)
};
