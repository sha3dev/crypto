import * as assert from "node:assert/strict";
import { test } from "node:test";

import { BinanceService } from "../../src/binance/binance.service.ts";
import { ChainlinkService } from "../../src/chainlink/chainlink.service.ts";
import { CoinbaseService } from "../../src/coinbase/coinbase.service.ts";
import { KrakenService } from "../../src/kraken/kraken.service.ts";
import { OkxService } from "../../src/okx/okx.service.ts";
import { OrderBookService } from "../../src/order-book/order-book.service.ts";
import type { WebSocketFactory } from "../../src/provider/provider.service.ts";
import type { FeedEvent, ProviderBaseOptions, ProviderContract, ProviderEventListener } from "../../src/provider/provider.types.ts";
import { ClockService } from "../../src/time/clock.service.ts";

const CREATE_NOOP_WEB_SOCKET_FACTORY = (): WebSocketFactory => {
  const webSocketFactory: WebSocketFactory = () => {
    throw new Error("ws not used in parser tests");
  };
  return webSocketFactory;
};

const CREATE_PROVIDER_OPTIONS = (): ProviderBaseOptions => {
  const providerOptions: ProviderBaseOptions = {
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 20,
    reconnectJitterRatio: 0,
    connectTimeoutMs: 100,
  };
  return providerOptions;
};

const COLLECT_EVENTS = (capturedEvents: FeedEvent[]): ProviderEventListener => {
  const providerListener: ProviderEventListener = (event: FeedEvent): void => {
    capturedEvents.push(event);
  };
  return providerListener;
};

const ARM_LISTENER = async (provider: ProviderContract, providerListener: ProviderEventListener): Promise<void> => {
  try {
    await provider.connect(providerListener);
  } catch {
    throw new Error("noop websocket factory should fail in parser tests");
  }
};

test("binance parser emits price and trade from aggTrade", async () => {
  const capturedEvents: FeedEvent[] = [];
  const binanceService = BinanceService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  await ARM_LISTENER(binanceService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  binanceService.handleRawMessage(
    JSON.stringify({
      stream: "btcusdt@aggTrade",
      data: { E: 1000, p: "10", q: "2", m: false },
    }),
  );

  const parsedEvents = capturedEvents.filter((event) => event.type !== "status");
  assert.equal(parsedEvents.length, 2);
});

test("coinbase parser handles invalid JSON by emitting error status", async () => {
  const capturedEvents: FeedEvent[] = [];
  const coinbaseService = CoinbaseService.create({
    symbols: ["btc"],
    maxLevels: 10,
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
    orderBookService: OrderBookService.create(),
  });

  await ARM_LISTENER(coinbaseService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  coinbaseService.handleRawMessage("{invalid");

  const hasErrorStatus = capturedEvents.some((event) => event.type === "status" && event.status === "error");
  assert.equal(hasErrorStatus, true);
});

test("kraken parser emits price event on ticker row", async () => {
  const capturedEvents: FeedEvent[] = [];
  const krakenService = KrakenService.create({
    symbols: ["btc"],
    maxLevels: 10,
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
    orderBookService: OrderBookService.create(),
  });

  await ARM_LISTENER(krakenService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  krakenService.handleRawMessage(
    JSON.stringify({
      channel: "ticker",
      data: [{ symbol: "BTC/USD", last: 20, timestamp: "2024-01-01T00:00:00.000Z" }],
    }),
  );

  const hasPriceEvent = capturedEvents.some((event) => event.type === "price");
  assert.equal(hasPriceEvent, true);
});

test("okx parser emits orderbook event on books5", async () => {
  const capturedEvents: FeedEvent[] = [];
  const okxService = OkxService.create({
    symbols: ["btc"],
    maxLevels: 5,
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  await ARM_LISTENER(okxService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  okxService.handleRawMessage(
    JSON.stringify({
      arg: { channel: "books5", instId: "BTC-USDT" },
      data: [{ ts: "1000", asks: [["11", "1"]], bids: [["10", "1"]] }],
    }),
  );

  const hasOrderBookEvent = capturedEvents.some((event) => event.type === "orderbook");
  assert.equal(hasOrderBookEvent, true);
});

test("chainlink parser emits price update", async () => {
  const capturedEvents: FeedEvent[] = [];
  const chainlinkService = ChainlinkService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  await ARM_LISTENER(chainlinkService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  chainlinkService.handleRawMessage(
    JSON.stringify({
      topic: "crypto_prices_chainlink",
      type: "update",
      payload: { symbol: "btc/usd", timestamp: 1000, value: 10 },
    }),
  );

  const hasPriceEvent = capturedEvents.some((event) => event.type === "price");
  assert.equal(hasPriceEvent, true);
});

test("chainlink parser normalizes configured symbol formats", async () => {
  const capturedEvents: FeedEvent[] = [];
  const chainlinkService = ChainlinkService.create({
    symbols: ["BTC/USD"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  await ARM_LISTENER(chainlinkService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  chainlinkService.handleRawMessage(
    JSON.stringify({
      topic: "crypto_prices_chainlink",
      type: "update",
      payload: { symbol: "btc/usd", timestamp: 1000, value: 10 },
    }),
  );

  const hasPriceEvent = capturedEvents.some((event) => event.type === "price");
  assert.equal(hasPriceEvent, true);
});

test("chainlink parser ignores PONG heartbeat frames", async () => {
  const capturedEvents: FeedEvent[] = [];
  const chainlinkService = ChainlinkService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: CREATE_NOOP_WEB_SOCKET_FACTORY(),
    providerOptions: CREATE_PROVIDER_OPTIONS(),
  });

  await ARM_LISTENER(chainlinkService, COLLECT_EVENTS(capturedEvents)).catch(() => undefined);
  chainlinkService.handleRawMessage("PONG");

  const hasErrorStatus = capturedEvents.some((event) => event.type === "status" && event.status === "error");
  assert.equal(hasErrorStatus, false);
});
