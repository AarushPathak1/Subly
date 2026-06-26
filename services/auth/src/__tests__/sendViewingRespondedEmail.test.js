"use strict";

process.env.RESEND_API_KEY = "test-resend-key";
process.env.APP_URL = "http://localhost:3000";

jest.mock("amqplib");
jest.mock("pg");
jest.mock("resend");
jest.mock("@clerk/express");

const { mockSend } = require("resend");
const { resetStore, addUser } = require("pg");

const { sendViewingRespondedEmail } = require("../index");

const RECIPIENT_ID = "recipient-uuid-1";
const CONV_ID = "conv-uuid-abc";

beforeEach(() => {
  resetStore();
  mockSend.mockClear();
  addUser({ id: RECIPIENT_ID, email: "student@ut.edu" });
});

describe("sendViewingRespondedEmail", () => {
  it("sends email with subject containing 'accepted'", async () => {
    await sendViewingRespondedEmail({
      recipientId: RECIPIENT_ID,
      listingTitle: "Cozy 1BR near UT",
      conversationId: CONV_ID,
      status: "accepted",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe("student@ut.edu");
    expect(call.subject).toContain("accepted");
    expect(call.subject).toContain("Cozy 1BR near UT");
  });

  it("sends email with subject containing 'declined'", async () => {
    await sendViewingRespondedEmail({
      recipientId: RECIPIENT_ID,
      listingTitle: "Studio near campus",
      conversationId: CONV_ID,
      status: "declined",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain("declined");
  });

  it("returns without throwing and does not query db when resend is null", async () => {
    jest.resetModules();
    jest.mock("amqplib");
    jest.mock("pg");
    jest.mock("resend");
    jest.mock("@clerk/express");
    delete process.env.RESEND_API_KEY;
    const { sendViewingRespondedEmail: sendNoResend } = require("../index");
    const { db } = require("../index");
    const querySpy = jest.spyOn(db, "query");

    await expect(
      sendNoResend({
        recipientId: RECIPIENT_ID,
        listingTitle: "Studio",
        conversationId: CONV_ID,
        status: "accepted",
      })
    ).resolves.not.toThrow();
    expect(querySpy).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = "test-resend-key";
  });

  it("does not send email when recipient has no rows in DB", async () => {
    await sendViewingRespondedEmail({
      recipientId: "nonexistent-id",
      listingTitle: "Studio",
      conversationId: CONV_ID,
      status: "accepted",
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
