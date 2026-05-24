import { describe, it, expect } from "vitest";
import { VerifyEmailSchema, VibeProfileSchema, ListingSchema } from "@/lib/schemas";

// ── VerifyEmailSchema ─────────────────────────────────────────────────────────

describe("VerifyEmailSchema", () => {
  it("accepts a valid .edu email", () => {
    expect(VerifyEmailSchema.safeParse({ email: "student@ut.edu" }).success).toBe(true);
  });

  it("accepts subdomain .edu emails", () => {
    expect(VerifyEmailSchema.safeParse({ email: "user@mail.utexas.edu" }).success).toBe(true);
  });

  it("rejects a gmail address", () => {
    const result = VerifyEmailSchema.safeParse({ email: "user@gmail.com" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/\.edu/);
  });

  it("rejects a .education domain (must end exactly in .edu)", () => {
    expect(VerifyEmailSchema.safeParse({ email: "user@school.education" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(VerifyEmailSchema.safeParse({ email: "notanemail" }).success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(VerifyEmailSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

// ── VibeProfileSchema ─────────────────────────────────────────────────────────

describe("VibeProfileSchema", () => {
  const valid = {
    university: "UT Austin",
    max_rent: "1500",
    min_bedrooms: "2",
    vibe_text: "Quiet place near campus",
  };

  it("accepts a valid profile", () => {
    expect(VibeProfileSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a profile without vibe_text (optional)", () => {
    const { vibe_text: _, ...rest } = valid;
    expect(VibeProfileSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects a university shorter than 2 characters", () => {
    const result = VibeProfileSchema.safeParse({ ...valid, university: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects a zero max_rent", () => {
    const result = VibeProfileSchema.safeParse({ ...valid, max_rent: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative max_rent", () => {
    const result = VibeProfileSchema.safeParse({ ...valid, max_rent: "-100" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric max_rent", () => {
    const result = VibeProfileSchema.safeParse({ ...valid, max_rent: "free" });
    expect(result.success).toBe(false);
  });

  it("rejects vibe_text over 500 characters", () => {
    const result = VibeProfileSchema.safeParse({ ...valid, vibe_text: "x".repeat(501) });
    expect(result.success).toBe(false);
  });
});

// ── ListingSchema ─────────────────────────────────────────────────────────────

describe("ListingSchema", () => {
  const valid = {
    title: "Sunny 2BR near UT campus",
    description: "Great place, fully furnished.",
    address: "123 Campus Drive, Austin TX",
    university_near: "UT Austin",
    rent: "1200",
    available_from: "2026-06-01",
    bedrooms: "2",
    bathrooms: "1",
  };

  it("accepts a complete valid listing", () => {
    expect(ListingSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a listing without optional fields", () => {
    const { description: _, university_near: __, available_to: ___, ...required } = {
      ...valid,
      available_to: "",
    };
    expect(ListingSchema.safeParse(required).success).toBe(true);
  });

  it("rejects a title shorter than 5 characters", () => {
    const result = ListingSchema.safeParse({ ...valid, title: "Hi" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/5 characters/);
  });

  it("rejects a title longer than 100 characters", () => {
    const result = ListingSchema.safeParse({ ...valid, title: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects a description over 2000 characters", () => {
    const result = ListingSchema.safeParse({ ...valid, description: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects an address shorter than 5 characters", () => {
    const result = ListingSchema.safeParse({ ...valid, address: "1st" });
    expect(result.success).toBe(false);
  });

  it("rejects a zero rent", () => {
    const result = ListingSchema.safeParse({ ...valid, rent: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative rent", () => {
    const result = ListingSchema.safeParse({ ...valid, rent: "-500" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric rent", () => {
    const result = ListingSchema.safeParse({ ...valid, rent: "cheap" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing available_from date", () => {
    const result = ListingSchema.safeParse({ ...valid, available_from: "" });
    expect(result.success).toBe(false);
  });
});
