/**
 * @section imports:externals
 */

import WebSocket from "ws";

/**
 * @section imports:internals
 */

import { HistoryQueryService } from "../history/history-query-service.js";
import { InMemoryHistoryStore } from "../history/in-memory-history-store.js";
import type { HistoryRetentionConfig } from "../history/history-types.js";
import CONFIG from "../config.js";
import { BinanceProvider } from "../providers/binance/binance-provider.js";
import { ChainlinkProvider } from "../providers/chainlink/chainlink-provider.js";
import { CoinbaseProvider } from "../providers/coinbase/coinbase-provider.js";
import { KrakenProvider } from "../providers/kraken/kraken-provider.js";
import { OkxProvider } from "../providers/okx/okx-provider.js";
import type { WebSocketFactory } from "../providers/shared/base-provider.js";
import type {
  FeedEvent,
  ProviderBaseOptions,
  ProviderContract
} from "../providers/shared/provider-types.js";
import { OrderBookMerger } from "../shared/order-book-merger.js";
import { SymbolNormalizer } from "../shared/symbol-normalizer.js";
import { TimeUtils } from "../shared/time-utils.js";
import { NoProvidersConnectedError } from "./no-providers-connected-error.js";
import type {
  ClientOptions,
  FeedEventListener,
  HistoryQuery,
  RetentionOptions,
  Subscription
} from "./client-types.js";
import type {
  CryptoProviderId,
  CryptoSymbol,
  OrderBookSnapshot,
  PricePoint,
  TradePoint
} from "../providers/shared/provider-types.js";

/**
 * @section consts
 */

const DEFAULT_SYMBOLS: CryptoSymbol[] = [...CONFIG.clientDefaults.symbols];
const DEFAULT_PROVIDERS: CryptoProviderId[] = [...CONFIG.clientDefaults.providers];
const DEFAULT_RETENTION: RetentionOptions = { ...CONFIG.clientDefaults.retention };
const DEFAULT_PROVIDER_OPTIONS: ProviderBaseOptions = CONFIG.providerConnection;
const DEFAULT_BOOK_LEVELS = CONFIG.clientDefaults.orderBookLevels;

/**
 * @section types
 */

type CryptoFeedClientConstructorOptions = {
  providers: ProviderContract[];
  store: InMemoryHistoryStore;
  historyQueryService: HistoryQueryService;
  timeUtils: TimeUtils;
};
type CreateProviderOptions = {
  contractId: CryptoProviderId;
  symbols: CryptoSymbol[];
  timeUtils: TimeUtils;
  wsFactory: WebSocketFactory;
};
type CreateProvidersOptions = {
  options: ClientOptions | undefined;
  symbolNormalizer: SymbolNormalizer;
  timeUtils: TimeUtils;
};

export class CryptoFeedClient {
  /**
   * @section private:attributes
   */

  private readonly providers: ProviderContract[];
  private readonly store: InMemoryHistoryStore;
  private readonly historyQueryService: HistoryQueryService;
  private readonly timeUtils: TimeUtils;

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  private readonly listeners: Set<FeedEventListener>;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(options: CryptoFeedClientConstructorOptions) {
    this.providers = options.providers;
    this.store = options.store;
    this.historyQueryService = options.historyQueryService;
    this.timeUtils = options.timeUtils;
    this.listeners = new Set<FeedEventListener>();
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(options?: ClientOptions): CryptoFeedClient {
    const symbolNormalizer = SymbolNormalizer.create();
    const timeUtils = TimeUtils.createSystemTime();
    const retention = CryptoFeedClient.toRetentionConfig(options?.retention);
    const store = InMemoryHistoryStore.create(retention);
    const queryService = HistoryQueryService.create(store, symbolNormalizer);
    const providers = CryptoFeedClient.createProviders({ options, symbolNormalizer, timeUtils });
    const client = new CryptoFeedClient({
      providers,
      store,
      historyQueryService: queryService,
      timeUtils
    });
    return client;
  }

  /**
   * @section private:methods
   */

  private static toRetentionConfig(input?: Partial<RetentionOptions>): HistoryRetentionConfig {
    const retention: HistoryRetentionConfig = {
      windowMs: input?.windowMs ?? DEFAULT_RETENTION.windowMs,
      maxSamplesPerStream: input?.maxSamplesPerStream ?? DEFAULT_RETENTION.maxSamplesPerStream,
      maxTradesPerStream: input?.maxTradesPerStream ?? DEFAULT_RETENTION.maxTradesPerStream
    };
    return retention;
  }

  private static createProvider(options: CreateProviderOptions): ProviderContract {
    const providerOptions = DEFAULT_PROVIDER_OPTIONS;
    const merger = OrderBookMerger.create();
    let provider: ProviderContract;

    if (options.contractId === "binance") {
      provider = BinanceProvider.create({
        symbols: options.symbols,
        timeUtils: options.timeUtils,
        wsFactory: options.wsFactory,
        providerOptions
      });
    } else if (options.contractId === "coinbase") {
      provider = CoinbaseProvider.create({
        symbols: options.symbols,
        maxLevels: DEFAULT_BOOK_LEVELS,
        timeUtils: options.timeUtils,
        wsFactory: options.wsFactory,
        providerOptions,
        bookMerger: merger
      });
    } else if (options.contractId === "kraken") {
      provider = KrakenProvider.create({
        symbols: options.symbols,
        maxLevels: DEFAULT_BOOK_LEVELS,
        timeUtils: options.timeUtils,
        wsFactory: options.wsFactory,
        providerOptions,
        bookMerger: merger
      });
    } else if (options.contractId === "okx") {
      provider = OkxProvider.create({
        symbols: options.symbols,
        maxLevels: DEFAULT_BOOK_LEVELS,
        timeUtils: options.timeUtils,
        wsFactory: options.wsFactory,
        providerOptions
      });
    } else {
      provider = ChainlinkProvider.create({
        symbols: options.symbols,
        timeUtils: options.timeUtils,
        wsFactory: options.wsFactory,
        providerOptions
      });
    }

    return provider;
  }

  private static createProviders(options: CreateProvidersOptions): ProviderContract[] {
    const rawSymbols = options.options?.symbols ?? DEFAULT_SYMBOLS;
    const symbols = options.symbolNormalizer.normalizeSymbols(rawSymbols);
    const providerIds = options.options?.providers ?? DEFAULT_PROVIDERS;
    const providers: ProviderContract[] = [];
    const wsFactory: WebSocketFactory = (url) => {
      const socket = new WebSocket(url);
      return socket;
    };

    for (const providerId of providerIds) {
      const provider = CryptoFeedClient.createProvider({
        contractId: providerId,
        symbols,
        timeUtils: options.timeUtils,
        wsFactory
      });
      providers.push(provider);
    }

    return providers;
  }

  private notifyListeners(event: FeedEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private handleProviderEvent(event: FeedEvent): void {
    if (event.type !== "status") {
      this.store.append(event, this.timeUtils.now());
    }

    this.notifyListeners(event);
  }

  /**
   * @section protected:methods
   */

  // empty

  /**
   * @section public:methods
   */

  public async connect(): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const provider of this.providers) {
      const task = provider.connect(this.handleProviderEvent.bind(this));
      tasks.push(task);
    }

    const settled = await Promise.allSettled(tasks);
    const failedProviders: string[] = [];
    let connectedCount = 0;

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const provider = this.providers[index];

      if (result?.status === "fulfilled") {
        connectedCount += 1;
      } else {
        const providerId = provider ? provider.id : "unknown-provider";
        failedProviders.push(providerId);
      }
    }

    if (connectedCount === 0) {
      throw NoProvidersConnectedError.fromProviders(failedProviders);
    }

    return;
  }

  public async disconnect(): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const provider of this.providers) {
      tasks.push(provider.disconnect());
    }

    await Promise.allSettled(tasks);
    this.listeners.clear();
    return;
  }

  public subscribe(listener: FeedEventListener): Subscription {
    this.listeners.add(listener);
    const subscription: Subscription = {
      unsubscribe: () => {
        this.listeners.delete(listener);
      }
    };
    return subscription;
  }

  public getLatestPrice(symbol: CryptoSymbol, provider?: CryptoProviderId): PricePoint | null {
    const latest = this.historyQueryService.getLatestPrice(symbol, provider);
    return latest;
  }

  public getLatestOrderBook(
    symbol: CryptoSymbol,
    provider?: CryptoProviderId
  ): OrderBookSnapshot | null {
    const latest = this.historyQueryService.getLatestOrderBook(symbol, provider);
    return latest;
  }

  public getLatestTrade(symbol: CryptoSymbol, provider?: CryptoProviderId): TradePoint | null {
    const latest = this.historyQueryService.getLatestTrade(symbol, provider);
    return latest;
  }

  public getPriceClosestTo(
    symbol: CryptoSymbol,
    targetTs: number,
    provider?: CryptoProviderId
  ): PricePoint | null {
    const closest = this.historyQueryService.getPriceClosestTo(symbol, targetTs, provider);
    return closest;
  }

  public getPriceHistory(query: HistoryQuery): PricePoint[] {
    const points = this.historyQueryService.getPriceHistory(query);
    return points;
  }

  public getOrderBookHistory(query: HistoryQuery): OrderBookSnapshot[] {
    const points = this.historyQueryService.getOrderBookHistory(query);
    return points;
  }

  public getTradeHistory(query: HistoryQuery): TradePoint[] {
    const points = this.historyQueryService.getTradeHistory(query);
    return points;
  }

  /**
   * @section static:methods
   */

  public static fromProviders(
    providers: ProviderContract[],
    retention?: Partial<RetentionOptions>
  ): CryptoFeedClient {
    const symbolNormalizer = SymbolNormalizer.create();
    const timeUtils = TimeUtils.createSystemTime();
    const retentionConfig = CryptoFeedClient.toRetentionConfig(retention);
    const store = InMemoryHistoryStore.create(retentionConfig);
    const queryService = HistoryQueryService.create(store, symbolNormalizer);
    const client = new CryptoFeedClient({
      providers,
      store,
      historyQueryService: queryService,
      timeUtils
    });
    return client;
  }
}
