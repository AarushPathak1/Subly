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

import { createCheckoutSession, verifyAndConfirmMatch } from "@/lib/actions";

// Shared fixture data
const mockConversation = {
  id: "conv-42",
  listing_id: "listing-1",
  listing_title: "Sunny 2BR near UT",
  renter_id: "user-renter",
  lister_id: "user-lister",
  other_email: "renter@ut.edu",
  created_at: "2026-06-01T00:00:00Z",
  initial_rent_cents: 150000,
};
const mockListerUser = {
  id: "user-lister",
  clerk_id: "clerk-lister",
  email: "lister@ut.edu",
  edu_verified: true,
  university: null,
};

// ── Fix 1 — verifyAndConfirmMatch: metadata conversation_id mismatch ──────────

describe("verifyAndConfirmMatch — Fix 1: metadata conversation_id check", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockStripeRetrieve.mockClear();
  });

  it("returns an error when session.metadata.conversation_id does not match the conversationId argument", async () => {
    // Stripe session belongs to conv-99, but we are calling with conv-42
    mockStripeRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { conversation_id: "conv-99" },
    });

    const result = await verifyAndConfirmMatch("conv-42", "sess_abc");
    expect(result).toEqual({ error: "Payment session does not match this conversation" });
    // The confirm endpoint must NOT be called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns an error when session.metadata is absent", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: null,
    });

    const result = await verifyAndConfirmMatch("conv-42", "sess_abc");
    expect(result).toEqual({ error: "Payment session does not match this conversation" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns an error when session.metadata.conversation_id is undefined", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: {},
    });

    const result = await verifyAndConfirmMatch("conv-42", "sess_abc");
    expect(result).toEqual({ error: "Payment session does not match this conversation" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proceeds to confirm when session.metadata.conversation_id matches", async () => {
    mockStripeRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { conversation_id: "conv-42" },
    });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await verifyAndConfirmMatch("conv-42", "sess_abc");
    expect(result).toEqual({});
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/conversations/conv-42/confirm"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("metadata mismatch is checked after payment_status — unpaid sessions return payment error first", async () => {
    // payment_status !== 'paid' should be caught before metadata check
    mockStripeRetrieve.mockResolvedValueOnce({
      payment_status: "unpaid",
      metadata: { conversation_id: "conv-99" },
    });

    const result = await verifyAndConfirmMatch("conv-42", "sess_abc");
    expect(result).toEqual({ error: "Payment not completed" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── Fix 6 — createCheckoutSession: idempotency key ───────────────────────────

describe("createCheckoutSession — Fix 6: idempotency key", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockStripeCreate.mockClear();
  });

  it("passes an idempotency key as the second argument to stripe.checkout.sessions.create", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/test" });

    await createCheckoutSession("conv-42");

    expect(mockStripeCreate).toHaveBeenCalledTimes(1);
    const [, secondArg] = mockStripeCreate.mock.calls[0];
    expect(secondArg).toBeDefined();
    expect(typeof secondArg.idempotencyKey).toBe("string");
    expect(secondArg.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("idempotency key contains the conversation ID", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/test" });

    await createCheckoutSession("conv-42");

    const [, secondArg] = mockStripeCreate.mock.calls[0];
    expect(secondArg.idempotencyKey).toContain("conv-42");
  });

  it("idempotency key contains the user ID", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/test" });

    await createCheckoutSession("conv-42");

    const [, secondArg] = mockStripeCreate.mock.calls[0];
    // The lister's user ID must appear in the key
    expect(secondArg.idempotencyKey).toContain(mockListerUser.id);
  });

  it("repeated calls with the same conversation produce the same idempotency key", async () => {
    // First call
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/test" });
    await createCheckoutSession("conv-42");
    const [, firstCallOpts] = mockStripeCreate.mock.calls[0];

    mockStripeCreate.mockClear();
    mockFetch.mockClear();

    // Second call — same inputs, must produce the same idempotency key
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/test" });
    await createCheckoutSession("conv-42");
    const [, secondCallOpts] = mockStripeCreate.mock.calls[0];

    expect(secondCallOpts.idempotencyKey).toBe(firstCallOpts.idempotencyKey);
  });

  it("idempotency key differs when the conversation ID differs", async () => {
    const otherConversation = { ...mockConversation, id: "conv-99" };

    // First call with conv-42
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockConversation });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/1" });
    await createCheckoutSession("conv-42");
    const [, opts42] = mockStripeCreate.mock.calls[0];

    mockStripeCreate.mockClear();
    mockFetch.mockClear();

    // Second call with a different conversation (conv-99 has a different lister_id too,
    // but let us keep the same lister for isolation — swap only conversation_id)
    const otherConvSameLister = { ...otherConversation, lister_id: mockListerUser.id };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => otherConvSameLister });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockListerUser });
    mockStripeCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/pay/2" });
    await createCheckoutSession("conv-99");
    const [, opts99] = mockStripeCreate.mock.calls[0];

    expect(opts99.idempotencyKey).not.toBe(opts42.idempotencyKey);
  });
});
