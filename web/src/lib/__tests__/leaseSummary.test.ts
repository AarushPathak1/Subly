import { describe, it, expect } from "vitest";
import { leaseSummary } from "@/lib/leaseSummary";

describe("leaseSummary", () => {
  // ── Happy-path: fixed-term with end date ─────────────────────────────────

  it("4-month sublease — May 1 to Aug 31", () => {
    // 122 days → 122/30.4375 ≈ 4.009 → rounds to 4
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-05-01",
      available_to: "2026-08-31",
    });
    expect(result).toBe("4-month sublease · $4,800 total");
  });

  it("3-month sublease — Jun 1 to Aug 31", () => {
    // 91 days → 91/30.4375 ≈ 2.99 → rounds to 3
    const result = leaseSummary({
      rent_cents: 150000,
      available_from: "2026-06-01",
      available_to: "2026-08-31",
    });
    expect(result).toBe("3-month sublease · $4,500 total");
  });

  it("12-month sublease — Jan 1 to Dec 31", () => {
    // 364 days → 364/30.4375 ≈ 11.96 → rounds to 12
    const result = leaseSummary({
      rent_cents: 100000,
      available_from: "2026-01-01",
      available_to: "2026-12-31",
    });
    expect(result).toBe("12-month sublease · $12,000 total");
  });

  // ── Happy-path: open-ended (no end date) ─────────────────────────────────

  it("open-ended when available_to is absent", () => {
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-05-01",
    });
    expect(result).toBe("Open-ended · $1,200/mo");
  });

  it("open-ended when available_to is undefined", () => {
    const result = leaseSummary({
      rent_cents: 200000,
      available_from: "2026-06-01",
      available_to: undefined,
    });
    expect(result).toBe("Open-ended · $2,000/mo");
  });

  // ── Edge case: same-day range → minimum 1-month ──────────────────────────

  it("same-day range (0 days) returns 1-month minimum", () => {
    // 0 days → Math.round(0/30.4375)=0 → Math.max(1,0)=1
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-06-15",
      available_to: "2026-06-15",
    });
    expect(result).toBe("1-month sublease · $1,200 total");
  });

  it("1-day range returns 1-month minimum", () => {
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-06-01",
      available_to: "2026-06-02",
    });
    expect(result).toBe("1-month sublease · $1,200 total");
  });

  // ── Edge case: available_to before available_from → 0 days → 1 month ────

  it("available_to before available_from is clamped to 1-month minimum", () => {
    // days = Math.max(0, negative) = 0 → rounds to 0 → max(1,0)=1
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-08-01",
      available_to: "2026-06-01",
    });
    expect(result).toBe("1-month sublease · $1,200 total");
  });

  // ── Edge case: malformed date falls back to open-ended ───────────────────

  it("malformed available_from falls back to open-ended string", () => {
    // new Date("not-a-date") is Invalid Date; toLocalString for rent still works
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "not-a-date",
      available_to: "2026-08-31",
    });
    // NaN days → NaN months → NaN check → open-ended fallback
    expect(result).toBe("Open-ended · $1,200/mo");
  });

  it("malformed available_to falls back to open-ended string", () => {
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-05-01",
      available_to: "not-a-date",
    });
    expect(result).toBe("Open-ended · $1,200/mo");
  });

  // ── Large rent amount formats with commas ────────────────────────────────

  it("formats large total cost with locale commas", () => {
    const result = leaseSummary({
      rent_cents: 500000,
      available_from: "2026-01-01",
      available_to: "2026-12-31",
    });
    // 12 months × $5,000 = $60,000
    expect(result).toBe("12-month sublease · $60,000 total");
  });

  // ── Boundary: empty string available_to behaves as open-ended ────────────

  it("empty string available_to returns open-ended", () => {
    const result = leaseSummary({
      rent_cents: 120000,
      available_from: "2026-05-01",
      available_to: "",
    });
    expect(result).toBe("Open-ended · $1,200/mo");
  });
});
