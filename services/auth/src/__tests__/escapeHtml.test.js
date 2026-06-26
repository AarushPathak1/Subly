"use strict";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("@clerk/express");

const { escapeHtml } = require("../index");

describe("escapeHtml", () => {
  it("escapes <script> tags", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes &", () => {
    expect(escapeHtml("Rent & Utilities")).toBe("Rent &amp; Utilities");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('Say "hello"')).toBe("Say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's mine")).toBe("it&#39;s mine");
  });

  it('returns "" for empty string', () => {
    expect(escapeHtml("")).toBe("");
  });

  it('returns "" for null', () => {
    expect(escapeHtml(null)).toBe("");
  });

  it('returns "" for undefined', () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Sunny 2BR near campus")).toBe("Sunny 2BR near campus");
  });

  it("escapes a malicious listing title attempting markup injection", () => {
    const malicious = '<style>*{display:none}</style><a href="//phish.com">Click</a>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<style>");
    expect(escaped).not.toContain("<a href");
    expect(escaped).toBe(
      "&lt;style&gt;*{display:none}&lt;/style&gt;&lt;a href=&quot;//phish.com&quot;&gt;Click&lt;/a&gt;"
    );
  });
});
