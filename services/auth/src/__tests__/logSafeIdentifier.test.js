"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const { logSafeIdentifier } = require("../index");

describe("logSafeIdentifier", () => {
  it("returns 8-char hex hash for a non-empty string", () => {
    const result = logSafeIdentifier("student@ut.edu");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns "<empty>" for null', () => {
    expect(logSafeIdentifier(null)).toBe("<empty>");
  });

  it('returns "<empty>" for undefined', () => {
    expect(logSafeIdentifier(undefined)).toBe("<empty>");
  });

  it('returns "<empty>" for empty string', () => {
    expect(logSafeIdentifier("")).toBe("<empty>");
  });

  it("is deterministic — same input produces same output", () => {
    expect(logSafeIdentifier("student@ut.edu")).toBe(logSafeIdentifier("student@ut.edu"));
  });

  it("differs for different inputs", () => {
    expect(logSafeIdentifier("a@gmail.com")).not.toBe(logSafeIdentifier("b@gmail.com"));
  });
});
