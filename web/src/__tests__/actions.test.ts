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

import {
  calculateMatchFee,
  fetchConversation,
  fetchMessages,
  sendMessage,
  createCheckoutSession,
  verifyAndConfirmMatch,
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
  includes_agreement: false,
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

  it("returns Stripe checkout URL without agreement", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    const result = await createCheckoutSession("conv-1", false);
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

  it("adds agreement line item when includesAgreement is true", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1", true);
    const call = mockStripeCreate.mock.calls[0][0];
    expect(call.line_items).toHaveLength(2);
    expect(call.line_items[1].price_data.unit_amount).toBe(1900);
  });

  it("uses correct fee tier based on initial_rent_cents", async () => {
    const cheapConv = { ...mockConversation, initial_rent_cents: 80000 };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => cheapConv });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1", false);
    const call = mockStripeCreate.mock.calls[0][0];
    expect(call.line_items[0].price_data.unit_amount).toBe(2900);
  });

  it("returns error when conversation fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await createCheckoutSession("conv-1", false)).toEqual({ error: "Conversation not found" });
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it("includes conversation_id in Stripe metadata", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1", false);
    const call = mockStripeCreate.mock.calls[0][0];
    expect(call.metadata.conversation_id).toBe("conv-1");
  });

  it("includes success_url and cancel_url", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("conv-1", false);
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

    const result = await verifyAndConfirmMatch("conv-1", "sess_123", false);
    expect(result).toEqual({});
    expect(mockStripeRetrieve).toHaveBeenCalledWith("sess_123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/conversations/conv-1/confirm"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns error when Stripe payment_status is not paid", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "unpaid" });
    expect(await verifyAndConfirmMatch("conv-1", "sess_123", false)).toEqual({ error: "Payment not completed" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error when Stripe API throws", async () => {
    mockStripeRetrieve.mockRejectedValueOnce(new Error("Stripe error"));
    expect(await verifyAndConfirmMatch("conv-1", "sess_123", false)).toEqual({ error: "Could not verify payment" });
  });

  it("returns error when confirm endpoint fails", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "paid" });
    mockFetch.mockResolvedValueOnce({ ok: false });
    expect(await verifyAndConfirmMatch("conv-1", "sess_123", false)).toEqual({ error: "Failed to confirm match" });
  });

  it("passes includes_agreement correctly to confirm body", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({ payment_status: "paid" });
    mockFetch.mockResolvedValueOnce({ ok: true });

    await verifyAndConfirmMatch("conv-1", "sess_123", true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.includes_agreement).toBe(true);
    expect(body.stripe_session_id).toBe("sess_123");
  });
});
