import * as assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryHistoryStore } from "../../src/history/in-memory-history-store.js";

test("history store prunes by window and size and returns inclusive range", () => {
  const store = InMemoryHistoryStore.create({
    windowMs: 1000,
    maxSamplesPerStream: 3,
    maxTradesPerStream: 3
  });

  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_000, price: 100 }, 1_100);
  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_200, price: 101 }, 1_200);
  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_300, price: 102 }, 1_300);
  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_400, price: 103 }, 1_400);
  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 2_600, price: 104 }, 2_600);

  const range = store.getRange({
    eventType: "price",
    symbol: "btc",
    provider: "binance",
    fromTs: 1_600,
    toTs: 2_600
  });
  const latestPoint = range[0] as { ts: number; price: number };

  assert.equal(range.length, 1);
  assert.equal(latestPoint.ts, 2_600);
  assert.equal(latestPoint.price, 104);
});

test("history store merges providers sorted by ts then provider", () => {
  const store = InMemoryHistoryStore.create({
    windowMs: 10_000,
    maxSamplesPerStream: 10,
    maxTradesPerStream: 10
  });

  store.append({ type: "price", provider: "kraken", symbol: "btc", ts: 2_000, price: 101 }, 2_000);
  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 2_000, price: 100 }, 2_000);
  store.append(
    { type: "price", provider: "coinbase", symbol: "btc", ts: 2_100, price: 102 },
    2_100
  );

  const range = store.getRange({ eventType: "price", symbol: "btc", fromTs: 1_900, toTs: 2_200 });

  assert.equal(range.length, 3);
  assert.equal(range[0]?.provider, "binance");
  assert.equal(range[1]?.provider, "kraken");
  assert.equal(range[2]?.provider, "coinbase");
});

test("history store closest price tie picks lower timestamp", () => {
  const store = InMemoryHistoryStore.create({
    windowMs: 10_000,
    maxSamplesPerStream: 10,
    maxTradesPerStream: 10
  });

  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_000, price: 99 }, 1_000);
  store.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_200, price: 101 }, 1_200);

  const closest = store.getClosestPrice("btc", 1_100, "binance");

  assert.equal(closest?.ts, 1_000);
  assert.equal(closest?.price, 99);
});
