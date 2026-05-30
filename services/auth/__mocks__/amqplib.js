"use strict";

const mockChannel = {
  assertQueue: jest.fn().mockResolvedValue({}),
  sendToQueue: jest.fn(),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
};

const connect = jest.fn().mockResolvedValue(mockConnection);

module.exports = { connect, mockChannel, mockConnection };
