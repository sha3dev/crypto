import * as assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import WebSocket from "ws";

import { ChainlinkProvider } from "../../src/providers/chainlink/chainlink-provider.js";
import type { ProviderBaseOptions } from "../../src/providers/shared/provider-types.js";
import { TimeUtils } from "../../src/shared/time-utils.js";

type MockSocket = EventEmitter & {
  readyState: number;
  send(data: string): void;
  close(): void;
};

type GlobalTimerMethods = {
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
};

const createProviderOptions = (): ProviderBaseOptions => {
  const options: ProviderBaseOptions = {
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 20,
    reconnectJitterRatio: 0,
    connectTimeoutMs: 500
  };
  return options;
};

const createMockSocket = (sentMessages: string[]): MockSocket => {
  const socket = new EventEmitter() as MockSocket;
  socket.readyState = WebSocket.CONNECTING;
  socket.send = (data: string) => {
    sentMessages.push(data);
  };
  socket.close = () => {
    socket.readyState = WebSocket.CLOSED;
  };
  return socket;
};

test("chainlink provider sends PING every 5s and clears timer on disconnect", async () => {
  const sentMessages: string[] = [];
  const sockets: MockSocket[] = [];
  let capturedDelayMs = -1;
  let capturedCallback: (() => void) | null = null;
  let capturedIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let clearedHandle: ReturnType<typeof setInterval> | null = null;
  const timers = globalThis as unknown as GlobalTimerMethods;
  const originalSetInterval = timers.setInterval;
  const originalClearInterval = timers.clearInterval;

  timers.setInterval = ((callback: () => void, delay?: number): ReturnType<typeof setInterval> => {
    capturedDelayMs = Number(delay ?? 0);
    capturedCallback = callback;
    capturedIntervalHandle = {} as ReturnType<typeof setInterval>;
    return capturedIntervalHandle;
  }) as unknown as typeof setInterval;
  timers.clearInterval = ((intervalId: ReturnType<typeof setInterval>): void => {
    clearedHandle = intervalId;
  }) as typeof clearInterval;

  try {
    const wsFactory = (): WebSocket => {
      const socket = createMockSocket(sentMessages);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    };
    const provider = ChainlinkProvider.create({
      symbols: ["btc"],
      timeUtils: TimeUtils.createSystemTime(),
      wsFactory,
      providerOptions: createProviderOptions()
    });

    const connectPromise = provider.connect(() => {
      // empty
    });
    const firstSocket = sockets[0];
    assert.ok(firstSocket);
    firstSocket.readyState = WebSocket.OPEN;
    firstSocket.emit("open");
    await connectPromise;

    assert.equal(capturedDelayMs, 5_000);
    const pingCallback = capturedCallback as unknown;
    assert.ok(pingCallback);
    (pingCallback as () => void)();
    const hasPing = sentMessages.includes("PING");
    assert.equal(hasPing, true);

    await provider.disconnect();
    assert.equal(clearedHandle, capturedIntervalHandle);
  } finally {
    timers.setInterval = originalSetInterval;
    timers.clearInterval = originalClearInterval;
  }
});
