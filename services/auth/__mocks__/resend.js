"use strict";

const mockSend = jest.fn().mockResolvedValue({ data: { id: "mock-email-id" }, error: null });

class Resend {
  constructor() {
    this.emails = { send: mockSend };
  }
}

module.exports = { Resend, mockSend };
