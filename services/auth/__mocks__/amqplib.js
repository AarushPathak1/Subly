"use strict";

const _consumers = {};

const mockChannel = {
  assertQueue: jest.fn().mockResolvedValue({}),
  sendToQueue: jest.fn(),
  consume: jest.fn((queue, handler) => {
    _consumers[queue] = handler;
    return Promise.resolve({});
  }),
  ack: jest.fn(),
  nack: jest.fn(),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
};

const connect = jest.fn().mockResolvedValue(mockConnection);

function getConsumers() { return _consumers; }
function resetConsumers() { Object.keys(_consumers).forEach((k) => delete _consumers[k]); }

module.exports = { connect, mockChannel, mockConnection, getConsumers, resetConsumers };
