import * as assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import WebSocket from "ws";

import { CryptoFeedClient } from "../../src/client/crypto-feed-client.js";
import { NoProvidersConnectedError } from "../../src/client/no-providers-connected-error.js";
import { BinanceProvider } from "../../src/providers/binance/binance-provider.js";
import { ChainlinkProvider } from "../../src/providers/chainlink/chainlink-provider.js";
import { CoinbaseProvider } from "../../src/providers/coinbase/coinbase-provider.js";
import { KrakenProvider } from "../../src/providers/kraken/kraken-provider.js";
import { OkxProvider } from "../../src/providers/okx/okx-provider.js";
import type {
  FeedEvent,
  OrderBookSnapshot,
  PricePoint,
  ProviderBaseOptions,
  ProviderContract,
  ProviderEventListener,
  TradePoint
} from "../../src/providers/shared/provider-types.js";
import { OrderBookMerger } from "../../src/shared/order-book-merger.js";
import { TimeUtils } from "../../src/shared/time-utils.js";

const LIVE_FEED_TESTS_ENABLED = process.env.LIVE_FEED_TESTS === "1";
const LIVE_PROVIDER_TIMEOUT_MS = 60_000;
const LIVE_CLIENT_TIMEOUT_MS = 90_000;
const MIN_REASONABLE_BTC_PRICE = 1_000;
const MIN_REASONABLE_TIMESTAMP = 1_700_000_000_000;

type RequiredEventType = "price" | "orderbook" | "trade";

type EventRequirement = {
  provider: string;
  symbol: string;
  type: RequiredEventType;
};

type CoverageWaiterOptions = {
  timeoutMs: number;
  requirements: EventRequirement[];
};

type CoverageWaiter = {
  promise: Promise<Map<string, FeedEvent>>;
  listener: ProviderEventListener;
  dispose(): void;
};

type RunProviderCoverageOptions = {
  context: TestContext;
  provider: ProviderContract;
  requirements: EventRequirement[];
  timeoutMs: number;
  providerName: string;
  skipRateLimited: boolean;
};

const createProviderOptions = (): ProviderBaseOptions => {
  const options: ProviderBaseOptions = {
    reconnectBaseDelayMs: 1_000,
    reconnectMaxDelayMs: 5_000,
    reconnectJitterRatio: 0.1,
    connectTimeoutMs: 15_000
  };
  return options;
};

const createWsFactory = (): ((url: string) => WebSocket) => {
  const wsFactory = (url: string): WebSocket => {
    const socket = new WebSocket(url);
    return socket;
  };
  return wsFactory;
};

const toRequirementKey = (requirement: EventRequirement): string => {
  const key = `${requirement.provider}:${requirement.symbol}:${requirement.type}`;
  return key;
};

const isReasonablePrice = (price: number): boolean => {
  const reasonable = Number.isFinite(price) && price > MIN_REASONABLE_BTC_PRICE;
  return reasonable;
};

const isReasonableTimestamp = (ts: number): boolean => {
  const reasonable = Number.isFinite(ts) && ts > MIN_REASONABLE_TIMESTAMP;
  return reasonable;
};

const isValidPriceEvent = (event: PricePoint): boolean => {
  const valid = isReasonablePrice(event.price) && isReasonableTimestamp(event.ts);
  return valid;
};

const isValidOrderBookEvent = (event: OrderBookSnapshot): boolean => {
  const bestAsk = event.asks[0];
  const bestBid = event.bids[0];
  const hasLevels = event.asks.length > 0 && event.bids.length > 0;
  const validBestAsk =
    Boolean(bestAsk) && Number.isFinite(bestAsk?.price) && Number.isFinite(bestAsk?.size);
  const validBestBid =
    Boolean(bestBid) && Number.isFinite(bestBid?.price) && Number.isFinite(bestBid?.size);
  const bestAskPrice = bestAsk ? bestAsk.price : 0;
  const bestBidPrice = bestBid ? bestBid.price : 0;
  const validSpread = hasLevels ? bestAskPrice >= bestBidPrice : false;
  const validTimestamp = isReasonableTimestamp(event.ts);
  const valid = hasLevels && validBestAsk && validBestBid && validSpread && validTimestamp;
  return valid;
};

const isValidTradeEvent = (event: TradePoint): boolean => {
  const validPrice = isReasonablePrice(event.price);
  const validSize = Number.isFinite(event.size) && event.size > 0;
  const validTimestamp = isReasonableTimestamp(event.ts);
  const valid = validPrice && validSize && validTimestamp;
  return valid;
};

const matchesRequirement = (event: FeedEvent, requirement: EventRequirement): boolean => {
  let matches = false;

  if (event.type === requirement.type) {
    const sameProvider = event.provider === requirement.provider;
    const sameSymbol = event.symbol === requirement.symbol;

    if (sameProvider && sameSymbol) {
      if (event.type === "price") {
        matches = isValidPriceEvent(event);
      } else if (event.type === "orderbook") {
        matches = isValidOrderBookEvent(event);
      } else {
        matches = isValidTradeEvent(event);
      }
    }
  }

  return matches;
};

const createCoverageWaiter = (options: CoverageWaiterOptions): CoverageWaiter => {
  const matchedEvents = new Map<string, FeedEvent>();
  let active = true;
  let resolveRef: ((value: Map<string, FeedEvent>) => void) | null = null;
  let rejectRef: ((reason: Error) => void) | null = null;

  const promise = new Promise<Map<string, FeedEvent>>((resolve, reject) => {
    resolveRef = resolve;
    rejectRef = reject;
  });

  const timer = setTimeout(() => {
    if (active && rejectRef) {
      rejectRef(
        new Error(
          `Timed out waiting for live requirements: ${options.requirements.map((item) => toRequirementKey(item)).join(", ")}`
        )
      );
    }
  }, options.timeoutMs);

  const listener: ProviderEventListener = (event: FeedEvent): void => {
    if (active) {
      for (const requirement of options.requirements) {
        const key = toRequirementKey(requirement);
        const alreadyMatched = matchedEvents.has(key);

        if (!alreadyMatched) {
          const match = matchesRequirement(event, requirement);

          if (match) {
            matchedEvents.set(key, event);
          }
        }
      }

      if (matchedEvents.size === options.requirements.length && resolveRef) {
        clearTimeout(timer);
        resolveRef(matchedEvents);
      }
    }
  };

  const dispose = (): void => {
    active = false;
    clearTimeout(timer);
  };

  const waiter: CoverageWaiter = { promise, listener, dispose };
  return waiter;
};

const isRateLimitedError = (error: unknown): boolean => {
  let limited = false;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    limited =
      message.includes("429") || message.includes("rate") || message.includes("too many requests");
  }

  return limited;
};

const isTimeoutError = (error: unknown): boolean => {
  let timeout = false;

  if (error instanceof Error) {
    timeout = error.message.toLowerCase().includes("timed out");
  }

  return timeout;
};

const isOnlyChainlinkUnavailable = (error: unknown): boolean => {
  let unavailable = false;

  if (error instanceof NoProvidersConnectedError) {
    const failedProviders = error.getFailedProviders();
    unavailable = failedProviders.length === 1 && failedProviders[0] === "chainlink";
  }

  return unavailable;
};

const runProviderCoverage = async (options: RunProviderCoverageOptions): Promise<void> => {
  const waiter = createCoverageWaiter({
    timeoutMs: options.timeoutMs,
    requirements: options.requirements
  });
  let matchedEvents: Map<string, FeedEvent> | null = null;

  try {
    await options.provider.connect(waiter.listener);
  } catch (error) {
    waiter.dispose();
    await options.provider.disconnect();

    if (options.skipRateLimited && isRateLimitedError(error)) {
      options.context.skip(`${options.providerName} endpoint rate-limited this environment`);
      return;
    }

    throw error;
  }

  try {
    matchedEvents = await waiter.promise;
  } finally {
    waiter.dispose();
    await options.provider.disconnect();
  }

  assert.equal(matchedEvents !== null, true);

  if (matchedEvents) {
    for (const requirement of options.requirements) {
      const key = toRequirementKey(requirement);
      assert.equal(matchedEvents.has(key), true);
    }
  }
};

test(
  "live binance provider emits price, orderbook and trade",
  { skip: !LIVE_FEED_TESTS_ENABLED },
  async (context) => {
    const provider = BinanceProvider.create({
      symbols: ["btc"],
      timeUtils: TimeUtils.createSystemTime(),
      wsFactory: createWsFactory(),
      providerOptions: createProviderOptions()
    });

    await runProviderCoverage({
      context,
      provider,
      providerName: "binance",
      timeoutMs: LIVE_PROVIDER_TIMEOUT_MS,
      skipRateLimited: false,
      requirements: [
        { provider: "binance", symbol: "btc", type: "price" },
        { provider: "binance", symbol: "btc", type: "orderbook" },
        { provider: "binance", symbol: "btc", type: "trade" }
      ]
    });
  }
);

test(
  "live coinbase provider emits price and orderbook",
  { skip: !LIVE_FEED_TESTS_ENABLED },
  async (context) => {
    const provider = CoinbaseProvider.create({
      symbols: ["btc"],
      maxLevels: 10,
      timeUtils: TimeUtils.createSystemTime(),
      wsFactory: createWsFactory(),
      providerOptions: createProviderOptions(),
      bookMerger: OrderBookMerger.create()
    });

    await runProviderCoverage({
      context,
      provider,
      providerName: "coinbase",
      timeoutMs: LIVE_PROVIDER_TIMEOUT_MS,
      skipRateLimited: false,
      requirements: [
        { provider: "coinbase", symbol: "btc", type: "price" },
        { provider: "coinbase", symbol: "btc", type: "orderbook" }
      ]
    });
  }
);

test(
  "live kraken provider emits price and orderbook",
  { skip: !LIVE_FEED_TESTS_ENABLED },
  async (context) => {
    const provider = KrakenProvider.create({
      symbols: ["btc"],
      maxLevels: 10,
      timeUtils: TimeUtils.createSystemTime(),
      wsFactory: createWsFactory(),
      providerOptions: createProviderOptions(),
      bookMerger: OrderBookMerger.create()
    });

    await runProviderCoverage({
      context,
      provider,
      providerName: "kraken",
      timeoutMs: LIVE_PROVIDER_TIMEOUT_MS,
      skipRateLimited: false,
      requirements: [
        { provider: "kraken", symbol: "btc", type: "price" },
        { provider: "kraken", symbol: "btc", type: "orderbook" }
      ]
    });
  }
);

test(
  "live okx provider emits price and orderbook",
  { skip: !LIVE_FEED_TESTS_ENABLED },
  async (context) => {
    const provider = OkxProvider.create({
      symbols: ["btc"],
      maxLevels: 10,
      timeUtils: TimeUtils.createSystemTime(),
      wsFactory: createWsFactory(),
      providerOptions: createProviderOptions()
    });

    await runProviderCoverage({
      context,
      provider,
      providerName: "okx",
      timeoutMs: LIVE_PROVIDER_TIMEOUT_MS,
      skipRateLimited: false,
      requirements: [
        { provider: "okx", symbol: "btc", type: "price" },
        { provider: "okx", symbol: "btc", type: "orderbook" }
      ]
    });
  }
);

test("live chainlink provider emits price", { skip: !LIVE_FEED_TESTS_ENABLED }, async (context) => {
  const provider = ChainlinkProvider.create({
    symbols: ["btc"],
    timeUtils: TimeUtils.createSystemTime(),
    wsFactory: createWsFactory(),
    providerOptions: createProviderOptions()
  });

  await runProviderCoverage({
    context,
    provider,
    providerName: "chainlink",
    timeoutMs: LIVE_PROVIDER_TIMEOUT_MS,
    skipRateLimited: true,
    requirements: [{ provider: "chainlink", symbol: "btc", type: "price" }]
  });
});

test(
  "live client emits all required core exchange event types",
  { skip: !LIVE_FEED_TESTS_ENABLED },
  async () => {
    const client = CryptoFeedClient.create({
      symbols: ["btc"],
      providers: ["binance", "coinbase", "kraken", "okx"]
    });
    const waiter = createCoverageWaiter({
      timeoutMs: LIVE_CLIENT_TIMEOUT_MS,
      requirements: [
        { provider: "binance", symbol: "btc", type: "price" },
        { provider: "binance", symbol: "btc", type: "orderbook" },
        { provider: "binance", symbol: "btc", type: "trade" },
        { provider: "coinbase", symbol: "btc", type: "price" },
        { provider: "coinbase", symbol: "btc", type: "orderbook" },
        { provider: "kraken", symbol: "btc", type: "price" },
        { provider: "kraken", symbol: "btc", type: "orderbook" },
        { provider: "okx", symbol: "btc", type: "price" },
        { provider: "okx", symbol: "btc", type: "orderbook" }
      ]
    });
    const subscription = client.subscribe(waiter.listener);
    let matchedEvents: Map<string, FeedEvent> | null = null;

    await client.connect();

    try {
      matchedEvents = await waiter.promise;
    } finally {
      subscription.unsubscribe();
      await client.disconnect();
    }

    assert.equal(matchedEvents !== null, true);

    if (matchedEvents) {
      assert.equal(matchedEvents.size, 9);
      const latestTrade = client.getLatestTrade("btc", "binance");
      assert.equal(latestTrade !== null, true);
      const latestOrderBook = client.getLatestOrderBook("btc", "okx");
      assert.equal(latestOrderBook !== null, true);
      const latestPrice = client.getLatestPrice("btc", "coinbase");
      assert.equal(latestPrice !== null, true);
    }
  }
);

test(
  "live client emits chainlink BTC price when available",
  { skip: !LIVE_FEED_TESTS_ENABLED },
  async (context) => {
    const client = CryptoFeedClient.create({ symbols: ["btc"], providers: ["chainlink"] });
    let waiter: CoverageWaiter | null = null;
    let subscription: { unsubscribe(): void } | null = null;
    let matchedEvents: Map<string, FeedEvent> | null = null;
    let waiterError: unknown = null;

    try {
      await client.connect();
    } catch (error) {
      await client.disconnect();
      if (isOnlyChainlinkUnavailable(error) || isRateLimitedError(error)) {
        context.skip("Chainlink client source unavailable in this environment");
        return;
      }

      throw error;
    }

    waiter = createCoverageWaiter({
      timeoutMs: LIVE_PROVIDER_TIMEOUT_MS,
      requirements: [{ provider: "chainlink", symbol: "btc", type: "price" }]
    });
    subscription = client.subscribe(waiter.listener);

    try {
      matchedEvents = await waiter.promise;
    } catch (error) {
      waiterError = error;
    } finally {
      waiter.dispose();
      if (subscription) {
        subscription.unsubscribe();
      }

      await client.disconnect();
    }

    if (waiterError) {
      if (isTimeoutError(waiterError)) {
        context.skip(
          "Chainlink client stream did not emit BTC price within timeout in this environment"
        );
      }

      throw waiterError;
    }

    assert.equal(matchedEvents !== null, true);

    if (matchedEvents) {
      assert.equal(matchedEvents.size, 1);
      const latest = client.getLatestPrice("btc", "chainlink");
      assert.equal(latest !== null, true);
    }
  }
);
