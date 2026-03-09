import * as assert from "node:assert/strict";
import { test } from "node:test";

import { CryptoFeedClient } from "../../src/index.ts";

const IS_LIVE_FEED_TESTS_ENABLED = process.env.LIVE_FEED_TESTS === "1";
const WAIT_TIMEOUT_MS = 90_000;

const WAIT_FOR_PRICE = async (client: CryptoFeedClient): Promise<void> => {
  const pricePromise = new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Timed out waiting for price event"));
    }, WAIT_TIMEOUT_MS);
    const subscription = client.subscribe((event) => {
      const isExpectedPrice = event.type === "price" && event.symbol === "btc";

      if (isExpectedPrice) {
        clearTimeout(timeoutHandle);
        subscription.unsubscribe();
        resolve();
      }
    });
  });

  await pricePromise;
};

test("live feeds produce at least one btc price when enabled", async (testContext) => {
  if (!IS_LIVE_FEED_TESTS_ENABLED) {
    testContext.skip("LIVE_FEED_TESTS is not enabled");
  }

  const client = CryptoFeedClient.create({
    symbols: ["btc"],
    providers: ["binance", "coinbase", "kraken", "okx", "chainlink"],
  });

  try {
    await client.connect();
    await WAIT_FOR_PRICE(client);
    const latestPrice = client.getLatestPrice("btc");
    const hasLatestPrice = latestPrice !== null;
    assert.equal(hasLatestPrice, true);
  } finally {
    await client.disconnect();
  }
});
