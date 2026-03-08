import * as assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryHistoryService } from "../../src/history/in-memory-history.service.ts";

test("history service prunes by window and size and returns inclusive range", () => {
  const historyService = InMemoryHistoryService.create({
    windowMs: 1000,
    maxSamplesPerStream: 3,
    maxTradesPerStream: 3,
  });

  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_000, price: 100 }, 1_100);
  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_200, price: 101 }, 1_200);
  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_300, price: 102 }, 1_300);
  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_400, price: 103 }, 1_400);
  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 2_600, price: 104 }, 2_600);

  const historyRange = historyService.getRange({
    eventType: "price",
    symbol: "btc",
    provider: "binance",
    fromTs: 1_600,
    toTs: 2_600,
  });
  const latestPoint = historyRange[0] as { ts: number; price: number };

  assert.equal(historyRange.length, 1);
  assert.equal(latestPoint.ts, 2_600);
  assert.equal(latestPoint.price, 104);
});

test("history service merges providers sorted by ts then provider", () => {
  const historyService = InMemoryHistoryService.create({
    windowMs: 10_000,
    maxSamplesPerStream: 10,
    maxTradesPerStream: 10,
  });

  historyService.append({ type: "price", provider: "kraken", symbol: "btc", ts: 2_000, price: 101 }, 2_000);
  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 2_000, price: 100 }, 2_000);
  historyService.append({ type: "price", provider: "coinbase", symbol: "btc", ts: 2_100, price: 102 }, 2_100);

  const historyRange = historyService.getRange({
    eventType: "price",
    symbol: "btc",
    fromTs: 1_900,
    toTs: 2_200,
  });

  assert.equal(historyRange.length, 3);
  assert.equal(historyRange[0]?.provider, "binance");
  assert.equal(historyRange[1]?.provider, "kraken");
  assert.equal(historyRange[2]?.provider, "coinbase");
});

test("history service closest price tie picks lower timestamp", () => {
  const historyService = InMemoryHistoryService.create({
    windowMs: 10_000,
    maxSamplesPerStream: 10,
    maxTradesPerStream: 10,
  });

  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_000, price: 99 }, 1_000);
  historyService.append({ type: "price", provider: "binance", symbol: "btc", ts: 1_200, price: 101 }, 1_200);

  const closestPoint = historyService.getClosestPrice("btc", 1_100, "binance");

  assert.equal(closestPoint?.ts, 1_000);
  assert.equal(closestPoint?.price, 99);
});
