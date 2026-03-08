import * as assert from "node:assert/strict";
import { test } from "node:test";

import { BinanceService } from "../../src/providers/binance/binance.service.ts";
import { ChainlinkService } from "../../src/providers/chainlink/chainlink.service.ts";
import { CoinbaseService } from "../../src/providers/coinbase/coinbase.service.ts";
import { KrakenService } from "../../src/providers/kraken/kraken.service.ts";
import { OkxService } from "../../src/providers/okx/okx.service.ts";
import type { WebSocketFactory } from "../../src/providers/shared/base-provider.service.ts";
import type { FeedEvent, ProviderBaseOptions, ProviderContract, ProviderEventListener } from "../../src/providers/shared/provider.types.ts";
import { ClockService } from "../../src/shared/clock.service.ts";
import { OrderBookMergerService } from "../../src/shared/order-book-merger.service.ts";

const createNoopWebSocketFactory = (): WebSocketFactory => {
  const webSocketFactory: WebSocketFactory = () => {
    throw new Error("ws not used in parser tests");
  };
  return webSocketFactory;
};

const createProviderOptions = (): ProviderBaseOptions => {
  const providerOptions: ProviderBaseOptions = {
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 20,
    reconnectJitterRatio: 0,
    connectTimeoutMs: 100,
  };
  return providerOptions;
};

const collectEvents = (capturedEvents: FeedEvent[]): ProviderEventListener => {
  const providerListener: ProviderEventListener = (event: FeedEvent): void => {
    capturedEvents.push(event);
  };
  return providerListener;
};

const armListener = async (provider: ProviderContract, providerListener: ProviderEventListener): Promise<void> => {
  try {
    await provider.connect(providerListener);
  } catch {
    // intentional in parser tests: ws factory is a noop thrower
  }
};

test("binance parser emits price and trade from aggTrade", async () => {
  const capturedEvents: FeedEvent[] = [];
  const binanceService = BinanceService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
  });

  await armListener(binanceService, collectEvents(capturedEvents));
  binanceService.handleRawMessage(
    JSON.stringify({
      stream: "btcusdt@aggTrade",
      data: { E: 1000, p: "10", q: "2", m: false },
    }),
  );

  const parsedEvents = capturedEvents.filter((event) => {
    const isNonStatusEvent = event.type !== "status";
    return isNonStatusEvent;
  });

  assert.equal(parsedEvents.length, 2);
});

test("coinbase parser handles invalid JSON by emitting error status", async () => {
  const capturedEvents: FeedEvent[] = [];
  const coinbaseService = CoinbaseService.create({
    symbols: ["btc"],
    maxLevels: 10,
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
    orderBookMergerService: OrderBookMergerService.create(),
  });

  await armListener(coinbaseService, collectEvents(capturedEvents));
  coinbaseService.handleRawMessage("{invalid");

  const hasErrorStatus = capturedEvents.some((event) => {
    const isErrorStatus = event.type === "status" && event.status === "error";
    return isErrorStatus;
  });

  assert.equal(hasErrorStatus, true);
});

test("kraken parser emits price event on ticker row", async () => {
  const capturedEvents: FeedEvent[] = [];
  const krakenService = KrakenService.create({
    symbols: ["btc"],
    maxLevels: 10,
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
    orderBookMergerService: OrderBookMergerService.create(),
  });

  await armListener(krakenService, collectEvents(capturedEvents));
  krakenService.handleRawMessage(
    JSON.stringify({
      channel: "ticker",
      data: [{ symbol: "BTC/USD", last: 20, timestamp: "2024-01-01T00:00:00.000Z" }],
    }),
  );

  const hasPriceEvent = capturedEvents.some((event) => {
    const isPriceEvent = event.type === "price";
    return isPriceEvent;
  });

  assert.equal(hasPriceEvent, true);
});

test("okx parser emits orderbook event on books5", async () => {
  const capturedEvents: FeedEvent[] = [];
  const okxService = OkxService.create({
    symbols: ["btc"],
    maxLevels: 5,
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
  });

  await armListener(okxService, collectEvents(capturedEvents));
  okxService.handleRawMessage(
    JSON.stringify({
      arg: { channel: "books5", instId: "BTC-USDT" },
      data: [{ ts: "1000", asks: [["11", "1"]], bids: [["10", "1"]] }],
    }),
  );

  const hasOrderBookEvent = capturedEvents.some((event) => {
    const isOrderBookEvent = event.type === "orderbook";
    return isOrderBookEvent;
  });

  assert.equal(hasOrderBookEvent, true);
});

test("chainlink parser emits price update", async () => {
  const capturedEvents: FeedEvent[] = [];
  const chainlinkService = ChainlinkService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
  });

  await armListener(chainlinkService, collectEvents(capturedEvents));
  chainlinkService.handleRawMessage(
    JSON.stringify({
      topic: "crypto_prices_chainlink",
      type: "update",
      payload: { symbol: "btc/usd", timestamp: 1000, value: 10 },
    }),
  );

  const hasPriceEvent = capturedEvents.some((event) => {
    const isPriceEvent = event.type === "price";
    return isPriceEvent;
  });

  assert.equal(hasPriceEvent, true);
});

test("chainlink parser normalizes configured symbol formats", async () => {
  const capturedEvents: FeedEvent[] = [];
  const chainlinkService = ChainlinkService.create({
    symbols: ["BTC/USD"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
  });

  await armListener(chainlinkService, collectEvents(capturedEvents));
  chainlinkService.handleRawMessage(
    JSON.stringify({
      topic: "crypto_prices_chainlink",
      type: "update",
      payload: { symbol: "btc/usd", timestamp: 1000, value: 10 },
    }),
  );

  const hasPriceEvent = capturedEvents.some((event) => {
    const isPriceEvent = event.type === "price";
    return isPriceEvent;
  });

  assert.equal(hasPriceEvent, true);
});

test("chainlink parser ignores PONG heartbeat frames", async () => {
  const capturedEvents: FeedEvent[] = [];
  const chainlinkService = ChainlinkService.create({
    symbols: ["btc"],
    clockService: ClockService.createSystemClock(),
    webSocketFactory: createNoopWebSocketFactory(),
    providerOptions: createProviderOptions(),
  });

  await armListener(chainlinkService, collectEvents(capturedEvents));
  chainlinkService.handleRawMessage("PONG");

  const hasErrorStatus = capturedEvents.some((event) => {
    const isErrorStatus = event.type === "status" && event.status === "error";
    return isErrorStatus;
  });

  assert.equal(hasErrorStatus, false);
});
