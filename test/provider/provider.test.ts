import * as assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import WebSocket from "ws";

import { BinanceService } from "../../src/binance/binance.service.ts";
import type { FeedEvent, ProviderBaseOptions } from "../../src/provider/provider.types.ts";
import { ClockService } from "../../src/time/clock.service.ts";

type MockSocket = EventEmitter & {
  readyState: number;
  send(messageText: string): void;
  close(): void;
};

const CREATE_PROVIDER_OPTIONS = (): ProviderBaseOptions => {
  const providerOptions: ProviderBaseOptions = {
    reconnectBaseDelayMs: 50,
    reconnectMaxDelayMs: 500,
    reconnectJitterRatio: 0.25,
    connectTimeoutMs: 1_000,
  };
  return providerOptions;
};

const CREATE_MOCK_SOCKET = (): MockSocket => {
  const mockSocket = new EventEmitter() as MockSocket;
  mockSocket.readyState = WebSocket.CONNECTING;
  mockSocket.send = () => {};
  mockSocket.close = () => {
    mockSocket.readyState = WebSocket.CLOSED;
  };
  return mockSocket;
};

const FIND_RECONNECT_STATUS_EVENT = (events: FeedEvent[]): FeedEvent | undefined => {
  const reconnectEvent = events.find((event) => event.type === "status" && event.status === "reconnecting");
  return reconnectEvent;
};

test("provider reconnects immediately on first disconnect", async () => {
  const sockets: MockSocket[] = [];
  const capturedEvents: FeedEvent[] = [];
  const webSocketFactory = (): WebSocket => {
    const mockSocket = CREATE_MOCK_SOCKET();
    sockets.push(mockSocket);
    return mockSocket as unknown as WebSocket;
  };
  const binanceService = BinanceService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory,
    providerOptions: CREATE_PROVIDER_OPTIONS(),
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
  const reconnectEvent = FIND_RECONNECT_STATUS_EVENT(capturedEvents);
  assert.equal(reconnectEvent?.type, "status");
  assert.equal(reconnectEvent?.message, "reconnecting in 0ms");

  const secondSocket = sockets[1];
  assert.ok(secondSocket);
  secondSocket.readyState = WebSocket.OPEN;
  secondSocket.emit("open");
  await binanceService.disconnect();
});

test("provider parse failure emits status error", async () => {
  const sockets: MockSocket[] = [];
  const capturedEvents: FeedEvent[] = [];
  const webSocketFactory = (): WebSocket => {
    const mockSocket = CREATE_MOCK_SOCKET();
    sockets.push(mockSocket);
    return mockSocket as unknown as WebSocket;
  };
  const binanceService = BinanceService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory,
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  const connectPromise = binanceService.connect((event) => {
    capturedEvents.push(event);
  });
  const firstSocket = sockets[0];
  assert.ok(firstSocket);
  firstSocket.readyState = WebSocket.OPEN;
  firstSocket.emit("open");
  await connectPromise;

  binanceService.handleRawMessage("{invalid");

  const hasErrorStatus = capturedEvents.some((event) => event.type === "status" && event.status === "error");
  assert.equal(hasErrorStatus, true);
  await binanceService.disconnect();
});

test("manual disconnect cancels reconnect path", async () => {
  const sockets: MockSocket[] = [];
  const capturedEvents: FeedEvent[] = [];
  const webSocketFactory = (): WebSocket => {
    const mockSocket = CREATE_MOCK_SOCKET();
    sockets.push(mockSocket);
    return mockSocket as unknown as WebSocket;
  };
  const binanceService = BinanceService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory,
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  const connectPromise = binanceService.connect((event) => {
    capturedEvents.push(event);
  });
  const firstSocket = sockets[0];
  assert.ok(firstSocket);
  firstSocket.readyState = WebSocket.OPEN;
  firstSocket.emit("open");
  await connectPromise;
  await binanceService.disconnect();

  firstSocket.readyState = WebSocket.CLOSED;
  firstSocket.emit("close", 1000, Buffer.from(""));
  await ClockService.createSystemClock().sleep(10);

  assert.equal(sockets.length, 1);
  const reconnectEvent = FIND_RECONNECT_STATUS_EVENT(capturedEvents);
  assert.equal(reconnectEvent, undefined);
});
