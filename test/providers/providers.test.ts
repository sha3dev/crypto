import * as assert from "node:assert/strict";
import { test } from "node:test";

import { BinanceProvider } from "../../src/providers/binance/binance-provider.js";
import { ChainlinkProvider } from "../../src/providers/chainlink/chainlink-provider.js";
import { CoinbaseProvider } from "../../src/providers/coinbase/coinbase-provider.js";
import { KrakenProvider } from "../../src/providers/kraken/kraken-provider.js";
import { OkxProvider } from "../../src/providers/okx/okx-provider.js";
import type { WebSocketFactory } from "../../src/providers/shared/base-provider.js";
import type {
  FeedEvent,
  ProviderBaseOptions,
  ProviderContract,
  ProviderEventListener
} from "../../src/providers/shared/provider-types.js";
import { OrderBookMerger } from "../../src/shared/order-book-merger.js";
import { TimeUtils } from "../../src/shared/time-utils.js";

const createNoopFactory = (): WebSocketFactory => {
  const factory: WebSocketFactory = () => {
    throw new Error("ws not used in parser tests");
  };
  return factory;
};

const createOptions = (): ProviderBaseOptions => {
  const options: ProviderBaseOptions = {
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 20,
    reconnectJitterRatio: 0,
    connectTimeoutMs: 100
  };
  return options;
};

const collectEvents = (events: FeedEvent[]): ProviderEventListener => {
  const listener: ProviderEventListener = (event: FeedEvent): void => {
    events.push(event);
  };
  return listener;
};

const armListener = async (
  provider: ProviderContract,
  listener: ProviderEventListener
): Promise<void> => {
  try {
    await provider.connect(listener);
  } catch {
    // intentional in parser tests: ws factory is a noop thrower
  }
};

test("binance parser emits price and trade from aggTrade", async () => {
  const events: FeedEvent[] = [];
  const provider = BinanceProvider.create({
    symbols: ["btc"],
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory: createNoopFactory(),
    providerOptions: createOptions()
  });

  await armListener(provider, collectEvents(events));
  provider.handleRawMessage(
    JSON.stringify({ stream: "btcusdt@aggTrade", data: { E: 1000, p: "10", q: "2", m: false } })
  );

  const dataEvents = events.filter((event) => {
    const keep = event.type !== "status";
    return keep;
  });

  assert.equal(dataEvents.length, 2);
});

test("coinbase parser handles invalid JSON by emitting error status", async () => {
  const events: FeedEvent[] = [];
  const provider = CoinbaseProvider.create({
    symbols: ["btc"],
    maxLevels: 10,
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory: createNoopFactory(),
    providerOptions: createOptions(),
    bookMerger: OrderBookMerger.create()
  });

  await armListener(provider, collectEvents(events));
  provider.handleRawMessage("{invalid");

  const hasErrorStatus = events.some((event) => {
    const keep = event.type === "status" && event.status === "error";
    return keep;
  });

  assert.equal(hasErrorStatus, true);
});

test("kraken parser emits price event on ticker row", async () => {
  const events: FeedEvent[] = [];
  const provider = KrakenProvider.create({
    symbols: ["btc"],
    maxLevels: 10,
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory: createNoopFactory(),
    providerOptions: createOptions(),
    bookMerger: OrderBookMerger.create()
  });

  await armListener(provider, collectEvents(events));
  provider.handleRawMessage(
    JSON.stringify({
      channel: "ticker",
      data: [{ symbol: "BTC/USD", last: 20, timestamp: "2024-01-01T00:00:00.000Z" }]
    })
  );

  const hasPrice = events.some((event) => {
    const keep = event.type === "price";
    return keep;
  });
  assert.equal(hasPrice, true);
});

test("okx parser emits orderbook event on books5", async () => {
  const events: FeedEvent[] = [];
  const provider = OkxProvider.create({
    symbols: ["btc"],
    maxLevels: 5,
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory: createNoopFactory(),
    providerOptions: createOptions()
  });

  await armListener(provider, collectEvents(events));
  provider.handleRawMessage(
    JSON.stringify({
      arg: { channel: "books5", instId: "BTC-USDT" },
      data: [{ ts: "1000", asks: [["11", "1"]], bids: [["10", "1"]] }]
    })
  );

  const hasBook = events.some((event) => {
    const keep = event.type === "orderbook";
    return keep;
  });
  assert.equal(hasBook, true);
});

test("chainlink parser emits price update", async () => {
  const events: FeedEvent[] = [];
  const provider = ChainlinkProvider.create({
    symbols: ["btc"],
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory: createNoopFactory(),
    providerOptions: createOptions()
  });

  await armListener(provider, collectEvents(events));
  provider.handleRawMessage(
    JSON.stringify({
      topic: "crypto_prices_chainlink",
      type: "update",
      payload: { symbol: "btc/usd", timestamp: 1000, value: 10 }
    })
  );

  const hasPrice = events.some((event) => {
    const keep = event.type === "price";
    return keep;
  });
  assert.equal(hasPrice, true);
});
