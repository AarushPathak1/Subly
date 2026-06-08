"use strict";

// Set env before module loads so resend client is created
process.env.RESEND_API_KEY = "test-resend-key";
process.env.APP_URL = "http://localhost:3000";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("resend");
jest.mock("@clerk/express");

const { mockSend } = require("resend");
const { mockChannel, getConsumers, resetConsumers } = require("amqplib");
const { resetStore, addUser } = require("pg");

const {
  sendNewMessageEmail,
  sendMatchConfirmedEmail,
  sendListingExpiredEmail,
  consumeNotifications,
} = require("../index");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LISTER_ID  = "lister-uuid-1";
const RENTER_ID  = "renter-uuid-2";
const CONV_ID    = "conv-uuid-abc";
const LISTING_ID = "listing-uuid-xyz";

beforeEach(() => {
  resetStore();
  resetConsumers();
  mockSend.mockClear();
  mockChannel.ack.mockClear();
  mockChannel.consume.mockClear();
  mockChannel.assertQueue.mockClear();
  addUser({ id: LISTER_ID, email: "lister@wisc.edu" });
  addUser({ id: RENTER_ID, email: "renter@umn.edu" });
});

// ── sendNewMessageEmail ───────────────────────────────────────────────────────

describe("sendNewMessageEmail", () => {
  it("sends email to recipient with correct subject", async () => {
    await sendNewMessageEmail({
      recipientId: RENTER_ID,
      listingTitle: "2BR near UMN",
      conversationId: CONV_ID,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe("renter@umn.edu");
    expect(call.subject).toContain("2BR near UMN");
  });

  it("includes a link to the conversation in the email body", async () => {
    await sendNewMessageEmail({
      recipientId: RENTER_ID,
      listingTitle: "Studio near campus",
      conversationId: CONV_ID,
    });
    const html = mockSend.mock.calls[0][0].html;
    expect(html).toContain(`/messages/${CONV_ID}`);
  });

  it("skips sending if recipient is not found in DB", async () => {
    await sendNewMessageEmail({
      recipientId: "nonexistent-id",
      listingTitle: "Studio",
      conversationId: CONV_ID,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends to the correct recipient (lister) when lister is recipient", async () => {
    await sendNewMessageEmail({
      recipientId: LISTER_ID,
      listingTitle: "My listing",
      conversationId: CONV_ID,
    });
    expect(mockSend.mock.calls[0][0].to).toBe("lister@wisc.edu");
  });
});

// ── sendMatchConfirmedEmail ───────────────────────────────────────────────────

describe("sendMatchConfirmedEmail", () => {
  it("sends separate emails to both lister and renter", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: RENTER_ID,
      listingTitle: "Cozy 1BR",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    const recipients = mockSend.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("lister@wisc.edu");
    expect(recipients).toContain("renter@umn.edu");
  });

  it("lister email subject mentions the listing title", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: RENTER_ID,
      listingTitle: "Sunny 2BR",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    const listerEmail = mockSend.mock.calls.find((c) => c[0].to === "lister@wisc.edu")[0];
    expect(listerEmail.subject).toContain("Sunny 2BR");
  });

  it("renter email subject says match is confirmed", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: RENTER_ID,
      listingTitle: "Studio",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    const renterEmail = mockSend.mock.calls.find((c) => c[0].to === "renter@umn.edu")[0];
    expect(renterEmail.subject.toLowerCase()).toContain("confirmed");
  });

  it("both emails include conversation link", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: RENTER_ID,
      listingTitle: "Studio",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    for (const [call] of mockSend.mock.calls) {
      expect(call.html).toContain(`/messages/${CONV_ID}`);
    }
  });

  it("includes agreement note in both emails when includesAgreement is true", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: RENTER_ID,
      listingTitle: "Studio",
      conversationId: CONV_ID,
      includesAgreement: true,
    });
    for (const [call] of mockSend.mock.calls) {
      expect(call.html.toLowerCase()).toContain("agreement");
    }
  });

  it("does not include agreement note when includesAgreement is false", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: RENTER_ID,
      listingTitle: "Studio",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    for (const [call] of mockSend.mock.calls) {
      expect(call.html).not.toContain("agreement");
    }
  });

  it("still sends renter email even if lister is not found", async () => {
    await sendMatchConfirmedEmail({
      listerId: "nonexistent",
      renterId: RENTER_ID,
      listingTitle: "Studio",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("renter@umn.edu");
  });

  it("still sends lister email even if renter is not found", async () => {
    await sendMatchConfirmedEmail({
      listerId: LISTER_ID,
      renterId: "nonexistent",
      listingTitle: "Studio",
      conversationId: CONV_ID,
      includesAgreement: false,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("lister@wisc.edu");
  });
});

// ── sendListingExpiredEmail ───────────────────────────────────────────────────

describe("sendListingExpiredEmail", () => {
  it("sends email to lister with the listing title", async () => {
    await sendListingExpiredEmail({
      listerId: LISTER_ID,
      listingId: LISTING_ID,
      listingTitle: "Expired 2BR",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe("lister@wisc.edu");
    expect(call.subject).toContain("Expired 2BR");
  });

  it("includes a repost link pointing to the listing edit page", async () => {
    await sendListingExpiredEmail({
      listerId: LISTER_ID,
      listingId: LISTING_ID,
      listingTitle: "Old listing",
    });
    const html = mockSend.mock.calls[0][0].html;
    expect(html).toContain(`/listings/${LISTING_ID}/edit`);
  });

  it("skips if lister is not found in DB", async () => {
    await sendListingExpiredEmail({
      listerId: "nonexistent",
      listingId: LISTING_ID,
      listingTitle: "Ghost listing",
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ── consumeNotifications ─────────────────────────────────────────────────────

describe("consumeNotifications", () => {
  beforeEach(async () => {
    await consumeNotifications(mockChannel);
  });

  it("asserts all three notification queues", () => {
    const queues = mockChannel.assertQueue.mock.calls.map((c) => c[0]);
    expect(queues).toContain("notifications.new_message");
    expect(queues).toContain("notifications.match_confirmed");
    expect(queues).toContain("notifications.listing_expired");
  });

  it("registers a consumer for each queue", () => {
    const consumers = getConsumers();
    expect(consumers["notifications.new_message"]).toBeInstanceOf(Function);
    expect(consumers["notifications.match_confirmed"]).toBeInstanceOf(Function);
    expect(consumers["notifications.listing_expired"]).toBeInstanceOf(Function);
  });

  // ── new_message consumer ─────────────────────────────────────────────────

  describe("new_message consumer", () => {
    function makeMsg(payload) {
      return { content: Buffer.from(JSON.stringify(payload)) };
    }

    it("sends email and acks on success", async () => {
      const msg = makeMsg({
        recipient_id: RENTER_ID,
        sender_id: LISTER_ID,
        listing_title: "Nice place",
        conversation_id: CONV_ID,
      });
      await getConsumers()["notifications.new_message"](msg);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it("acks even if email send throws", async () => {
      mockSend.mockRejectedValueOnce(new Error("Resend down"));
      const msg = makeMsg({
        recipient_id: RENTER_ID,
        sender_id: LISTER_ID,
        listing_title: "Nice place",
        conversation_id: CONV_ID,
      });
      await getConsumers()["notifications.new_message"](msg);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it("acks and skips gracefully for null message", async () => {
      await expect(
        getConsumers()["notifications.new_message"](null)
      ).resolves.not.toThrow();
    });
  });

  // ── match_confirmed consumer ─────────────────────────────────────────────

  describe("match_confirmed consumer", () => {
    function makeMsg(payload) {
      return { content: Buffer.from(JSON.stringify(payload)) };
    }

    it("sends emails to both parties and acks", async () => {
      const msg = makeMsg({
        lister_id: LISTER_ID,
        renter_id: RENTER_ID,
        listing_title: "Great place",
        conversation_id: CONV_ID,
        includes_agreement: false,
      });
      await getConsumers()["notifications.match_confirmed"](msg);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it("passes includes_agreement flag to email function", async () => {
      const msg = makeMsg({
        lister_id: LISTER_ID,
        renter_id: RENTER_ID,
        listing_title: "Great place",
        conversation_id: CONV_ID,
        includes_agreement: true,
      });
      await getConsumers()["notifications.match_confirmed"](msg);
      for (const [call] of mockSend.mock.calls) {
        expect(call.html.toLowerCase()).toContain("agreement");
      }
    });

    it("acks even if email send throws", async () => {
      mockSend.mockRejectedValue(new Error("Resend down"));
      const msg = makeMsg({
        lister_id: LISTER_ID,
        renter_id: RENTER_ID,
        listing_title: "Great place",
        conversation_id: CONV_ID,
        includes_agreement: false,
      });
      await getConsumers()["notifications.match_confirmed"](msg);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });
  });

  // ── listing_expired consumer ─────────────────────────────────────────────

  describe("listing_expired consumer", () => {
    function makeMsg(payload) {
      return { content: Buffer.from(JSON.stringify(payload)) };
    }

    it("sends email to lister and acks", async () => {
      const msg = makeMsg({
        lister_id: LISTER_ID,
        listing_id: LISTING_ID,
        listing_title: "My expired listing",
      });
      await getConsumers()["notifications.listing_expired"](msg);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].to).toBe("lister@wisc.edu");
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it("acks even if email send throws", async () => {
      mockSend.mockRejectedValueOnce(new Error("Resend down"));
      const msg = makeMsg({
        lister_id: LISTER_ID,
        listing_id: LISTING_ID,
        listing_title: "My expired listing",
      });
      await getConsumers()["notifications.listing_expired"](msg);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });
  });
});
