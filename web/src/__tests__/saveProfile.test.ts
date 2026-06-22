import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external deps before importing actions ───────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  })),
}));

vi.mock("@aws-sdk/client-s3", () => ({ S3Client: vi.fn(), PutObjectCommand: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { saveProfile } from "@/lib/actions";

function profileFormData(overrides: Record<string, string | undefined> = {}) {
  const defaults: Record<string, string> = {
    vibe_text: "Quiet, close to campus",
    university: "University of Texas at Austin",
    max_rent: "1500",
    min_bedrooms: "2",
  };
  const merged = { ...defaults, ...overrides };
  const fd = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) fd.set(key, value);
  }
  return fd;
}

describe("saveProfile", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockRedirect.mockClear();
    mockRevalidatePath.mockClear();
  });

  // ── Settings mode ────────────────────────────────────────────────────────────

  describe("settings mode", () => {
    it("returns a toast and does NOT redirect on success", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await saveProfile(null, profileFormData({ mode: "settings" }));

      expect(result).toEqual({ toast: "Preferences updated" });
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("revalidates both /settings and /dashboard on success", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await saveProfile(null, profileFormData({ mode: "settings" }));

      expect(mockRevalidatePath).toHaveBeenCalledWith("/settings");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
      expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
    });

    it("does not revalidate or toast when the API call fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await saveProfile(null, profileFormData({ mode: "settings" }));

      expect(result).toEqual({ error: "Failed to save profile. Please try again." });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("sends max_rent_cents and min_bedrooms as numbers in the request body", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await saveProfile(null, profileFormData({ mode: "settings", max_rent: "1500", min_bedrooms: "3" }));

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_rent_cents).toBe(150000);
      expect(body.min_bedrooms).toBe(3);
    });
  });

  // ── Onboarding mode ──────────────────────────────────────────────────────────

  describe("onboarding mode", () => {
    it("redirects to /dashboard on success when mode is explicitly 'onboarding'", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await saveProfile(null, profileFormData({ mode: "onboarding" }));

      expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
    });

    it("redirects to /dashboard on success when mode field is absent (defaults to onboarding)", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await saveProfile(null, profileFormData({ mode: undefined }));

      expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
    });

    it("does not call revalidatePath in onboarding mode", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await saveProfile(null, profileFormData({ mode: "onboarding" }));

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("does not redirect when the API call fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await saveProfile(null, profileFormData({ mode: "onboarding" }));

      expect(result).toEqual({ error: "Failed to save profile. Please try again." });
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────────

  describe("auth", () => {
    it("returns 'Not signed in' and makes no API call when there is no bearer token", async () => {
      vi.resetModules();
      vi.doMock("@clerk/nextjs/server", () => ({
        auth: () => ({ getToken: vi.fn().mockResolvedValue(null) }),
      }));
      vi.doMock("next/navigation", () => ({ redirect: mockRedirect }));
      vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
      vi.doMock("stripe", () => ({ default: vi.fn(() => ({ checkout: { sessions: {} } })) }));
      vi.doMock("@aws-sdk/client-s3", () => ({ S3Client: vi.fn(), PutObjectCommand: vi.fn() }));
      vi.doMock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

      const { saveProfile: saveProfileNoAuth } = await import("@/lib/actions");
      const result = await saveProfileNoAuth(null, profileFormData({ mode: "settings" }));

      expect(result).toEqual({ error: "Not signed in" });
      expect(mockFetch).not.toHaveBeenCalled();
      vi.resetModules();
    });
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  describe("validation", () => {
    it("rejects an empty university before hitting the network", async () => {
      const result = await saveProfile(null, profileFormData({ mode: "settings", university: "" }));
      expect(result).toEqual({ error: "Please enter your university" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a single-character university (below min length) before hitting the network", async () => {
      const result = await saveProfile(null, profileFormData({ mode: "settings", university: "A" }));
      expect(result).toEqual({ error: "Please enter your university" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a zero rent before hitting the network", async () => {
      const result = await saveProfile(null, profileFormData({ mode: "settings", max_rent: "0" }));
      expect(result).toEqual({ error: "Please enter a valid rent budget" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a negative rent before hitting the network", async () => {
      const result = await saveProfile(null, profileFormData({ mode: "settings", max_rent: "-100" }));
      expect(result).toEqual({ error: "Please enter a valid rent budget" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric rent before hitting the network", async () => {
      const result = await saveProfile(null, profileFormData({ mode: "settings", max_rent: "abc" }));
      expect(result).toEqual({ error: "Please enter a valid rent budget" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects vibe_text over 500 characters before hitting the network", async () => {
      const result = await saveProfile(
        null,
        profileFormData({ mode: "settings", vibe_text: "a".repeat(501) })
      );
      expect(result).toEqual({ error: "Keep it under 500 characters" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("accepts exactly 500 characters of vibe_text", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await saveProfile(
        null,
        profileFormData({ mode: "settings", vibe_text: "a".repeat(500) })
      );
      expect(result).toEqual({ toast: "Preferences updated" });
    });

    it("rejects an invalid mode value", async () => {
      const result = await saveProfile(null, profileFormData({ mode: "bogus" }));
      expect(result).toHaveProperty("error");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
