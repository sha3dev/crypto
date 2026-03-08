import * as assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import WebSocket from "ws";

import { ChainlinkService } from "../../src/providers/chainlink/chainlink.service.ts";
import type { ProviderBaseOptions } from "../../src/providers/shared/provider.types.ts";
import { ClockService } from "../../src/shared/clock.service.ts";

type MockSocket = EventEmitter & {
  readyState: number;
  send(messageText: string): void;
  close(): void;
};

type GlobalTimerMethods = {
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
};

const createProviderOptions = (): ProviderBaseOptions => {
  const providerOptions: ProviderBaseOptions = {
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 20,
    reconnectJitterRatio: 0,
    connectTimeoutMs: 500,
  };
  return providerOptions;
};

const createMockSocket = (sentMessages: string[]): MockSocket => {
  const mockSocket = new EventEmitter() as MockSocket;
  mockSocket.readyState = WebSocket.CONNECTING;
  mockSocket.send = (messageText: string) => {
    sentMessages.push(messageText);
  };
  mockSocket.close = () => {
    mockSocket.readyState = WebSocket.CLOSED;
  };
  return mockSocket;
};

test("chainlink provider sends PING every 5s and clears timer on disconnect", async () => {
  const sentMessages: string[] = [];
  const sockets: MockSocket[] = [];
  let capturedDelayMs = -1;
  let capturedCallback: (() => void) | null = null;
  let capturedIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let clearedHandle: ReturnType<typeof setInterval> | null = null;
  const globalTimerMethods = globalThis as unknown as GlobalTimerMethods;
  const originalSetInterval = globalTimerMethods.setInterval;
  const originalClearInterval = globalTimerMethods.clearInterval;

  globalTimerMethods.setInterval = ((callback: () => void, delay?: number) => {
    capturedDelayMs = Number(delay ?? 0);
    capturedCallback = callback;
    capturedIntervalHandle = {} as ReturnType<typeof setInterval>;
    return capturedIntervalHandle;
  }) as unknown as typeof setInterval;
  globalTimerMethods.clearInterval = ((intervalHandle: ReturnType<typeof setInterval>): void => {
    clearedHandle = intervalHandle;
  }) as typeof clearInterval;

  try {
    const webSocketFactory = (): WebSocket => {
      const mockSocket = createMockSocket(sentMessages);
      sockets.push(mockSocket);
      return mockSocket as unknown as WebSocket;
    };
    const chainlinkService = ChainlinkService.create({
      symbols: ["btc"],
      clockService: ClockService.createSystemClock(),
      webSocketFactory,
      providerOptions: createProviderOptions(),
    });

    const connectPromise = chainlinkService.connect(() => {});
    const firstSocket = sockets[0];
    assert.ok(firstSocket);
    firstSocket.readyState = WebSocket.OPEN;
    firstSocket.emit("open");
    await connectPromise;

    assert.equal(capturedDelayMs, 5_000);
    assert.ok(capturedCallback);
    const pingCallback = capturedCallback as () => void;
    pingCallback();
    const hasPing = sentMessages.includes("PING");
    assert.equal(hasPing, true);

    await chainlinkService.disconnect();
    assert.equal(clearedHandle, capturedIntervalHandle);
  } finally {
    globalTimerMethods.setInterval = originalSetInterval;
    globalTimerMethods.clearInterval = originalClearInterval;
  }
});
