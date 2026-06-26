import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external deps before importing actions ───────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const mockStripeCreate = vi.fn();
const mockStripeRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockStripeCreate,
        retrieve: mockStripeRetrieve,
      },
    },
  })),
}));

vi.mock("@aws-sdk/client-s3", () => ({ S3Client: vi.fn(), PutObjectCommand: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { calculateMatchFee } from "@/lib/fees";
import {
  fetchConversation,
  fetchMessages,
  sendMessage,
  createCheckoutSession,
  verifyAndConfirmMatch,
  submitReview,
  fetchReviewEligibility,
  fetchPublicReviews,
  fetchReviewsForListing,
  fetchReviewsForLister,
  fetchReviewSummary,
  fetchPublicStats,
  saveListing,
  unsaveListing,
  fetchSavedListings,
  fetchSavedListingIds,
  proposeViewing,
  respondToViewing,
  submitReport,
} from "@/lib/actions";

// ── calculateMatchFee ─────────────────────────────────────────────────────────

describe("calculateMatchFee", () => {
  it("returns $29 (2900¢) for rent under $1,000/mo", () => {
    expect(calculateMatchFee(0)).toBe(2900);
    expect(calculateMatchFee(50000)).toBe(2900);
    expect(calculateMatchFee(99999)).toBe(2900);
  });

  it("returns $49 (4900¢) for rent $1,000–$1,999/mo", () => {
    expect(calculateMatchFee(100000)).toBe(4900);
    expect(calculateMatchFee(150000)).toBe(4900);
    expect(calculateMatchFee(199999)).toBe(4900);
  });

  it("returns $79 (7900¢) for rent $2,000+/mo", () => {
    expect(calculateMatchFee(200000)).toBe(7900);
    expect(calculateMatchFee(300000)).toBe(7900);
    expect(calculateMatchFee(999999)).toBe(7900);
  });

  it("correctly hits the $1,000 boundary", () => {
    expect(calculateMatchFee(99999)).toBe(2900);
    expect(calculateMatchFee(100000)).toBe(4900);
  });

  it("correctly hits the $2,000 boundary", () => {
    expect(calculateMatchFee(199999)).toBe(4900);
    expect(calculateMatchFee(200000)).toBe(7900);
  });
});

// ── fetchConversation ─────────────────────────────────────────────────────────

const mockConversation = {
  id: "conv-1",
  listing_id: "listing-1",
  listing_title: "Sunny 2BR",
  renter_id: "user-1",
  lister_id: "user-2",
  other_email: "lister@ut.edu",
  created_at: "2026-06-01T00:00:00Z",
  initial_rent_cents: 120000,
};

describe("fetchConversation", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns conversation data on 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    const result = await fetchConversation("conv-1");
    expect(result).toEqual(mockConversation);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/messages/conversations/conv-1"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mock-token" }) })
    );
  });

  it("returns null when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchConversation("bad-id")).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchConversation("conv-1")).toBeNull();
  });
});

// ── fetchMessages ─────────────────────────────────────────────────────────────

const mockMessages = [
  { id: "msg-1", conversation_id: "conv-1", sender_id: "user-1", body: "Hey!", created_at: "2026-06-01T10:00:00Z" },
  { id: "msg-2", conversation_id: "conv-1", sender_id: "user-2", body: "Hi there!", created_at: "2026-06-01T10:01:00Z" },
];

describe("fetchMessages", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns messages array on 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockMessages });
    expect(await fetchMessages("conv-1")).toEqual(mockMessages);
  });

  it("returns empty array on error response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchMessages("conv-1")).toEqual([]);
  });

  it("returns empty array on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    expect(await fetchMessages("conv-1")).toEqual([]);
  });

  it("calls the correct endpoint with auth header", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchMessages("conv-1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/conversations/conv-1/messages"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mock-token" }) })
    );
  });
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe("sendMessage", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns empty object on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await sendMessage("conv-1", "Hello!")).toEqual({});
  });

  it("returns error object when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await sendMessage("conv-1", "Hello!")).toEqual({ error: "Failed to send message" });
  });

  it("sends message body as JSON", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await sendMessage("conv-1", "Test message");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ body: "Test message" }), method: "POST" })
    );
  });

  it("returns error when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await sendMessage("conv-1", "Hi")).toEqual({ error: "Failed to send message" });
  });
});

// ── createCheckoutSession ─────────────────────────────────────────────────────

describe("createCheckoutSession", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockStripeCreate.mockClear();
  });

  it("returns Stripe checkout URL", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    const result = await createCheckoutSession("conv-1");
    expect(result).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: expect.arrayContaining([
          expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 4900 }) }),
        ]),
      })
    );
  });

  it("uses correct fee tier based on initial_rent_cents", async () => {
    const cheapConv = { ...mockConversation, initial_rent_cents: 80000 };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => cheapConv });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1");
    const call = mockStripeCreate.mock.calls[0][0];
    expect(call.line_items[0].price_data.unit_amount).toBe(2900);
  });

  it("returns error when conversation fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await createCheckoutSession("conv-1")).toEqual({ error: "Conversation not found" });
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("includes conversation_id in Stripe metadata", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1");
    const call = mockStripeCreate.mock.calls[0][0];
    expect(call.metadata.conversation_id).toBe("conv-1");
  });

  it("includes success_url and cancel_url", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1");
    const call = mockStripeCreate.mock.calls[0][0];
    expect(call.success_url).toContain("conv-1/confirmed");
    expect(call.cancel_url).toContain("conv-1");
  });
});

// ── verifyAndConfirmMatch ─────────────────────────────────────────────────────

describe("verifyAndConfirmMatch", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockStripeRetrieve.mockClear();
  });

  it("verifies Stripe session and calls confirm endpoint on success", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "paid" });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await verifyAndConfirmMatch("conv-1", "sess_123");
    expect(result).toEqual({});
    expect(mockStripeRetrieve).toHaveBeenCalledWith("sess_123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/conversations/conv-1/confirm"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns error when Stripe payment_status is not paid", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "unpaid" });
    expect(await verifyAndConfirmMatch("conv-1", "sess_123")).toEqual({ error: "Payment not completed" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error when Stripe API throws", async () => {
    mockStripeRetrieve.mockRejectedValueOnce(new Error("Stripe error"));
    expect(await verifyAndConfirmMatch("conv-1", "sess_123")).toEqual({ error: "Could not verify payment" });
  });

  it("returns error when confirm endpoint fails", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "paid" });
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await verifyAndConfirmMatch("conv-1", "sess_123")).toEqual({ error: "Failed to confirm match" });
  });

  it("passes stripe_session_id in confirm body", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "paid" });
    mockFetch.mockResolvedValueOnce({ ok: true });

    await verifyAndConfirmMatch("conv-1", "sess_123");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stripe_session_id).toBe("sess_123");
  });
});

// ── submitReview ──────────────────────────────────────────────────────────────

function reviewFormData(rating: string | null, body?: string) {
  const fd = new FormData();
  if (rating !== null) fd.set("rating", rating);
  if (body !== undefined) fd.set("body", body);
  return fd;
}

describe("submitReview", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns toast on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });
    const result = await submitReview("conv-1", null, reviewFormData("5", "Great match!"));
    expect(result).toEqual({ toast: "Thanks for your review!" });
  });

  it("sends conversation_id, rating (as number), and body as JSON", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });
    await submitReview("conv-1", null, reviewFormData("4", "Pretty good"));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/listings/reviews"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conversation_id: "conv-1", rating: 4, body: "Pretty good" }),
      })
    );
  });

  it("rejects an out-of-range rating before hitting the network", async () => {
    const result = await submitReview("conv-1", null, reviewFormData("7", "x"));
    expect(result).toEqual({ error: "Please select a rating" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a missing rating before hitting the network", async () => {
    // Zod's built-in "required" check fires before the custom .refine() message
    // when the key is absent from the FormData entirely.
    const result = await submitReview("conv-1", null, reviewFormData(null));
    expect(result).toEqual({ error: "Required" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a body over 1000 characters before hitting the network", async () => {
    const result = await submitReview("conv-1", null, reviewFormData("5", "a".repeat(1001)));
    expect(result).toEqual({ error: "Keep it under 1000 characters" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps 409 to an already-reviewed error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409 });
    const result = await submitReview("conv-1", null, reviewFormData("5"));
    expect(result).toEqual({ error: "You've already reviewed this match." });
  });

  it("maps 422 to a not-confirmed error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });
    const result = await submitReview("conv-1", null, reviewFormData("5"));
    expect(result).toEqual({ error: "This match hasn't been confirmed yet." });
  });

  it("maps other failure statuses to a generic error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await submitReview("conv-1", null, reviewFormData("5"));
    expect(result).toEqual({ error: "Failed to submit review. Please try again." });
  });
});

// ── fetchReviewEligibility ────────────────────────────────────────────────────

describe("fetchReviewEligibility", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns eligibility payload on 200", async () => {
    const payload = { eligible: true, already_reviewed: false };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });
    expect(await fetchReviewEligibility("conv-1")).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/listings/reviews/eligibility?conversation_id=conv-1"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer mock-token" }),
        cache: "no-store",
      })
    );
  });

  it("returns null when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchReviewEligibility("conv-1")).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchReviewEligibility("conv-1")).toBeNull();
  });
});

// ── fetchPublicReviews ────────────────────────────────────────────────────────

describe("fetchPublicReviews", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns reviews array on 200", async () => {
    const reviews = [{ id: "r1", rating: 5, body: "Great!", created_at: "2026-01-01", reviewer_display_name: "A.", reviewer_university: "UCLA", listing_title: "Loft" }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => reviews });
    expect(await fetchPublicReviews()).toEqual(reviews);
  });

  it("does not send an Authorization header (public endpoint)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchPublicReviews();
    const opts = mockFetch.mock.calls[0][1] ?? {};
    expect(opts.headers).toBeUndefined();
  });

  it("returns empty array when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchPublicReviews()).toEqual([]);
  });

  it("returns empty array when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchPublicReviews()).toEqual([]);
  });
});

// ── fetchReviewsForListing ─────────────────────────────────────────────────────

describe("fetchReviewsForListing", () => {
  beforeEach(() => mockFetch.mockClear());

  it("calls the public reviews endpoint with listing_id query param", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchReviewsForListing("listing-1");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/public/reviews?");
    expect(url).toContain("listing_id=listing-1");
    expect(url).not.toContain("lister_id");
  });

  it("includes an explicit limit when provided", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchReviewsForListing("listing-1", 3);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("limit=3");
  });

  it("omits limit param when not provided", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchReviewsForListing("listing-1");
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain("limit=");
  });

  it("does not send an Authorization header (public endpoint)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchReviewsForListing("listing-1");
    const opts = mockFetch.mock.calls[0][1] ?? {};
    expect(opts.headers).toBeUndefined();
  });

  it("returns reviews array on 200", async () => {
    const reviews = [{ id: "r1", rating: 5, body: "Great!", created_at: "2026-01-01", reviewer_display_name: "A.", reviewer_university: "UCLA", listing_title: "Loft" }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => reviews });
    expect(await fetchReviewsForListing("listing-1")).toEqual(reviews);
  });

  it("returns empty array when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchReviewsForListing("listing-1")).toEqual([]);
  });

  it("returns empty array when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchReviewsForListing("listing-1")).toEqual([]);
  });
});

// ── fetchReviewsForLister ──────────────────────────────────────────────────────

describe("fetchReviewsForLister", () => {
  beforeEach(() => mockFetch.mockClear());

  it("calls the public reviews endpoint with lister_id query param", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchReviewsForLister("lister-1");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/public/reviews?");
    expect(url).toContain("lister_id=lister-1");
    expect(url).not.toContain("listing_id");
  });

  it("returns reviews array on 200", async () => {
    const reviews = [{ id: "r2", rating: 4, body: "Solid", created_at: "2026-01-02", reviewer_display_name: "B.", reviewer_university: "USC", listing_title: "Studio" }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => reviews });
    expect(await fetchReviewsForLister("lister-1")).toEqual(reviews);
  });

  it("returns empty array when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchReviewsForLister("lister-1")).toEqual([]);
  });

  it("returns empty array when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchReviewsForLister("lister-1")).toEqual([]);
  });
});

// ── fetchReviewSummary ─────────────────────────────────────────────────────────

describe("fetchReviewSummary", () => {
  beforeEach(() => mockFetch.mockClear());

  it("calls the summary endpoint with listing_id when given listing_id", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ average: 4.5, count: 2 }) });
    await fetchReviewSummary({ listing_id: "listing-1" });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/public/reviews/summary?");
    expect(url).toContain("listing_id=listing-1");
  });

  it("calls the summary endpoint with lister_id when given lister_id", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ average: 4.5, count: 2 }) });
    await fetchReviewSummary({ lister_id: "lister-1" });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("lister_id=lister-1");
  });

  it("returns the summary payload (including literal null average) on 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ average: null, count: 0 }) });
    expect(await fetchReviewSummary({ listing_id: "listing-1" })).toEqual({ average: null, count: 0 });
  });

  it("does not send an Authorization header (public endpoint)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ average: null, count: 0 }) });
    await fetchReviewSummary({ listing_id: "listing-1" });
    const opts = mockFetch.mock.calls[0][1] ?? {};
    expect(opts.headers).toBeUndefined();
  });

  it("returns null when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchReviewSummary({ listing_id: "listing-1" })).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchReviewSummary({ lister_id: "lister-1" })).toBeNull();
  });
});

// ── fetchPublicStats ──────────────────────────────────────────────────────────

describe("fetchPublicStats", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns stats payload on 200", async () => {
    const stats = {
      listings_total: 12,
      universities_total: 3,
      match_satisfaction_pct: 92,
      avg_time_to_match_hours: 6,
      review_count: 4,
      as_of: "2026-06-19T00:00:00Z",
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => stats });
    expect(await fetchPublicStats()).toEqual(stats);
  });

  it("returns null when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchPublicStats()).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchPublicStats()).toBeNull();
  });
});

// ── saveListing ───────────────────────────────────────────────────────────────

describe("saveListing", () => {
  beforeEach(() => mockFetch.mockClear());

  it("POSTs to /api/listings/saved with the listing_id and bearer token", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await saveListing("listing-123");
    expect(result).toEqual({});
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/listings/saved");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer mock-token");
    expect(JSON.parse(opts.body)).toEqual({ listing_id: "listing-123" });
  });

  it("returns an error when the API responds with a non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await saveListing("listing-123")).toEqual({ error: "Failed to save listing" });
  });

  it("returns an error when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await saveListing("listing-123")).toEqual({ error: "Failed to save listing" });
  });
});

// ── unsaveListing ─────────────────────────────────────────────────────────────

describe("unsaveListing", () => {
  beforeEach(() => mockFetch.mockClear());

  it("DELETEs to /api/listings/saved/{id} with a bearer token and no body", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await unsaveListing("listing-456");
    expect(result).toEqual({});
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/listings/saved/listing-456");
    expect(opts.method).toBe("DELETE");
    expect(opts.headers.Authorization).toBe("Bearer mock-token");
    expect(opts.body).toBeUndefined();
  });

  it("returns an error when the API responds with a non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    expect(await unsaveListing("listing-456")).toEqual({ error: "Failed to unsave listing" });
  });

  it("returns an error when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await unsaveListing("listing-456")).toEqual({ error: "Failed to unsave listing" });
  });
});

// ── fetchSavedListings / fetchSavedListingIds ─────────────────────────────────

describe("fetchSavedListings", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns the saved listings array on 200", async () => {
    const saved = [{ id: "l1", title: "Loft", saved_at: "2026-06-01T00:00:00Z" }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => saved });
    expect(await fetchSavedListings()).toEqual(saved);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/listings/saved");
    expect(opts.headers.Authorization).toBe("Bearer mock-token");
  });

  it("returns an empty array when the API responds with an error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await fetchSavedListings()).toEqual([]);
  });

  it("returns an empty array when fetch rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await fetchSavedListings()).toEqual([]);
  });
});

describe("fetchSavedListingIds", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns a Set of listing ids derived from fetchSavedListings", async () => {
    const saved = [{ id: "l1" }, { id: "l2" }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => saved });
    const ids = await fetchSavedListingIds();
    expect(ids).toBeInstanceOf(Set);
    expect(Array.from(ids).sort()).toEqual(["l1", "l2"]);
  });

  it("returns an empty Set when there are no saved listings", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const ids = await fetchSavedListingIds();
    expect(ids.size).toBe(0);
  });

  it("returns an empty Set when the underlying fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const ids = await fetchSavedListingIds();
    expect(ids.size).toBe(0);
  });
});

// ── proposeViewing ────────────────────────────────────────────────────────────

describe("proposeViewing", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns an empty object on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({});
  });

  it("maps invalid_proposed_at to friendly copy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_proposed_at" }),
    });
    expect(await proposeViewing("conv-1", "2020-01-01T10:00:00Z")).toEqual({
      error: "Pick a time in the future to propose a viewing.",
    });
  });

  it("maps note_too_long to friendly copy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "note_too_long" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z", "a".repeat(300))).toEqual({
      error: "Your note is too long — keep it under 280 characters.",
    });
  });

  it("maps conversation_confirmed to friendly copy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "conversation_confirmed" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "This match is already confirmed — no viewing needed.",
    });
  });

  it("falls back to 401 copy for an unmapped code with a 401 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "some_unmapped_code" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "You're signed out. Sign in and try again.",
    });
  });

  it("falls back to 403 copy for an unmapped code with a 403 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "some_unmapped_code" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "You don't have access to this conversation.",
    });
  });

  it("falls back to 404 copy for an unmapped code with a 404 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "some_unmapped_code" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "This conversation or proposal no longer exists.",
    });
  });

  it("falls back to the generic propose copy on a 500/unknown status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_error" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "Couldn't propose a viewing time. Please try again.",
    });
  });

  it("falls back to the generic propose copy when error is an empty string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "Couldn't propose a viewing time. Please try again.",
    });
  });

  it("falls back to 404 copy when error is an empty string and status is 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "" }),
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "This conversation or proposal no longer exists.",
    });
  });

  it("falls back to the generic propose copy when the response body isn't JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "Couldn't propose a viewing time. Please try again.",
    });
  });

  it("returns an error when fetch rejects (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await proposeViewing("conv-1", "2026-07-01T10:00:00Z")).toEqual({
      error: "Failed to propose a viewing time",
    });
  });
});

// ── respondToViewing ──────────────────────────────────────────────────────────

describe("respondToViewing", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns an empty object on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({});
  });

  it("maps proposal_not_pending to friendly copy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "proposal_not_pending" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "This proposal was already answered. Refresh to see the latest.",
    });
  });

  it("maps cannot_respond_to_own_proposal to friendly copy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "cannot_respond_to_own_proposal" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "You can't accept or decline your own proposal — wait for the other person.",
    });
  });

  it("maps invalid_action to friendly copy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_action" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "decline")).toEqual({
      error: "Something went wrong responding to this proposal. Please try again.",
    });
  });

  it("falls back to 401 copy for an unmapped code with a 401 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "some_unmapped_code" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "You're signed out. Sign in and try again.",
    });
  });

  it("falls back to 404 copy for an unmapped code with a 404 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "some_unmapped_code" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "This conversation or proposal no longer exists.",
    });
  });

  it("falls back to 403 copy for an unmapped code with a 403 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "some_unmapped_code" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "You don't have access to this conversation.",
    });
  });

  it("falls back to the generic respond copy on a 500/unknown status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_error" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "Couldn't respond to the viewing proposal. Please try again.",
    });
  });

  it("falls back to the generic respond copy when error is an empty string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "Couldn't respond to the viewing proposal. Please try again.",
    });
  });

  it("falls back to 401 copy when error is an empty string and status is 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "" }),
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "You're signed out. Sign in and try again.",
    });
  });

  it("falls back to the generic respond copy when the response body isn't JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "Couldn't respond to the viewing proposal. Please try again.",
    });
  });

  it("returns an error when fetch rejects (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    expect(await respondToViewing("conv-1", "msg-1", "accept")).toEqual({
      error: "Failed to respond to the viewing proposal",
    });
  });
});

// ── submitReport ──────────────────────────────────────────────────────────────

describe("submitReport", () => {
  beforeEach(() => mockFetch.mockClear());

  it("returns ok:true on 201", async () => {
    mockFetch.mockResolvedValueOnce({ status: 201 });
    const result = await submitReport({
      target_kind: "listing",
      target_id: "listing-1",
      reason: "scam",
      details: "looks fake",
    });
    expect(result).toEqual({ ok: true });
  });

  it("posts to /api/listings/reports with the bearer token and JSON body", async () => {
    mockFetch.mockResolvedValueOnce({ status: 201 });
    await submitReport({ target_kind: "user", target_id: "user-1", reason: "harassment" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/listings/reports"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer mock-token" }),
        body: JSON.stringify({ target_kind: "user", target_id: "user-1", reason: "harassment" }),
      })
    );
  });

  it("maps 409 to an already-reported error", async () => {
    mockFetch.mockResolvedValueOnce({ status: 409 });
    const result = await submitReport({ target_kind: "listing", target_id: "listing-1", reason: "spam" });
    expect(result).toEqual({ ok: false, error: "You've already reported this." });
  });

  it("maps other failure statuses to a generic error", async () => {
    mockFetch.mockResolvedValueOnce({ status: 500 });
    const result = await submitReport({ target_kind: "listing", target_id: "listing-1", reason: "other" });
    expect(result).toEqual({ ok: false, error: "Couldn't submit report. Please try again." });
  });

  it("returns a generic error when fetch rejects (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const result = await submitReport({ target_kind: "listing", target_id: "listing-1", reason: "other" });
    expect(result).toEqual({ ok: false, error: "Couldn't submit report. Please try again." });
  });
});
