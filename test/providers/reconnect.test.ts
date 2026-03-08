import * as assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import WebSocket from "ws";

import { BinanceService } from "../../src/providers/binance/binance.service.ts";
import type { FeedEvent, ProviderBaseOptions } from "../../src/providers/shared/provider.types.ts";
import { ClockService } from "../../src/shared/clock.service.ts";

type MockSocket = EventEmitter & {
  readyState: number;
  send(messageText: string): void;
  close(): void;
};

const createProviderOptions = (): ProviderBaseOptions => {
  const providerOptions: ProviderBaseOptions = {
    reconnectBaseDelayMs: 50,
    reconnectMaxDelayMs: 500,
    reconnectJitterRatio: 0.25,
    connectTimeoutMs: 1_000,
  };
  return providerOptions;
};

const createMockSocket = (): MockSocket => {
  const mockSocket = new EventEmitter() as MockSocket;
  mockSocket.readyState = WebSocket.CONNECTING;
  mockSocket.send = () => {};
  mockSocket.close = () => {
    mockSocket.readyState = WebSocket.CLOSED;
  };
  return mockSocket;
};

const findReconnectStatusEvent = (events: FeedEvent[]): FeedEvent | undefined => {
  const reconnectEvent = events.find((event) => {
    const isReconnectEvent = event.type === "status" && event.status === "reconnecting";
    return isReconnectEvent;
  });
  return reconnectEvent;
};

test("provider reconnects immediately on first disconnect", async () => {
  const sockets: MockSocket[] = [];
  const capturedEvents: FeedEvent[] = [];
  const webSocketFactory = (): WebSocket => {
    const mockSocket = createMockSocket();
    sockets.push(mockSocket);
    return mockSocket as unknown as WebSocket;
  };
  const binanceService = BinanceService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory,
    providerOptions: createProviderOptions(),
  });

  const connectPromise = binanceService.connect((event) => {
    capturedEvents.push(event);
  });
  const firstSocket = sockets[0];
  assert.ok(firstSocket);
  firstSocket.readyState = WebSocket.OPEN;
  firstSocket.emit("open");
  await connectPromise;

  firstSocket.readyState = WebSocket.CLOSED;
  firstSocket.emit("close", 1006, Buffer.from("network-down"));
  await ClockService.createSystemClock().sleep(10);

  assert.equal(sockets.length, 2);
  const reconnectEvent = findReconnectStatusEvent(capturedEvents);
  assert.equal(reconnectEvent?.type, "status");
  assert.equal(reconnectEvent?.message, "reconnecting in 0ms");

  const secondSocket = sockets[1];
  assert.ok(secondSocket);
  secondSocket.readyState = WebSocket.OPEN;
  secondSocket.emit("open");
  await binanceService.disconnect();
});
