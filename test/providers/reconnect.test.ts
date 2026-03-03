import * as assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import WebSocket from "ws";

import { BinanceProvider } from "../../src/providers/binance/binance-provider.js";
import type { FeedEvent, ProviderBaseOptions } from "../../src/providers/shared/provider-types.js";
import { TimeUtils } from "../../src/shared/time-utils.js";

type MockSocket = EventEmitter & {
  readyState: number;
  send(data: string): void;
  close(): void;
};

const createProviderOptions = (): ProviderBaseOptions => {
  const options: ProviderBaseOptions = {
    reconnectBaseDelayMs: 50,
    reconnectMaxDelayMs: 500,
    reconnectJitterRatio: 0.25,
    connectTimeoutMs: 1_000
  };
  return options;
};

const createMockSocket = (): MockSocket => {
  const socket = new EventEmitter() as MockSocket;
  socket.readyState = WebSocket.CONNECTING;
  socket.send = () => {
    // no-op: this test only validates reconnect scheduling
  };
  socket.close = () => {
    socket.readyState = WebSocket.CLOSED;
  };
  return socket;
};

const findReconnectStatusEvent = (events: FeedEvent[]): FeedEvent | undefined => {
  const event = events.find((item) => {
    const match = item.type === "status" && item.status === "reconnecting";
    return match;
  });
  return event;
};

test("provider reconnects immediately on first disconnect", async () => {
  const sockets: MockSocket[] = [];
  const events: FeedEvent[] = [];
  const wsFactory = (): WebSocket => {
    const socket = createMockSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  };
  const provider = BinanceProvider.create({
    symbols: ["btc"],
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory,
    providerOptions: createProviderOptions()
  });

  const connectPromise = provider.connect((event) => {
    events.push(event);
  });
  const firstSocket = sockets[0];
  assert.ok(firstSocket);
  firstSocket.readyState = WebSocket.OPEN;
  firstSocket.emit("open");
  await connectPromise;

  firstSocket.readyState = WebSocket.CLOSED;
  firstSocket.emit("close", 1006, Buffer.from("network-down"));
  await TimeUtils.createSystemTime().sleep(10);

  assert.equal(sockets.length, 2);
  const reconnecting = findReconnectStatusEvent(events);
  assert.equal(reconnecting?.type, "status");
  assert.equal(reconnecting?.message, "reconnecting in 0ms");

  const secondSocket = sockets[1];
  assert.ok(secondSocket);
  secondSocket.readyState = WebSocket.OPEN;
  secondSocket.emit("open");
  await provider.disconnect();
});
