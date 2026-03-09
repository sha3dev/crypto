/**
 * @section imports:externals
 */

import WebSocket from "ws";

/**
 * @section imports:internals
 */

import { BinanceService } from "../binance/binance.service.ts";
import { ChainlinkService } from "../chainlink/chainlink.service.ts";
import { CoinbaseService } from "../coinbase/coinbase.service.ts";
import config from "../config.ts";
import { HistoryQueryService } from "../history/history-query.service.ts";
import { HistoryStoreService } from "../history/history-store.service.ts";
import type { HistoryRetentionConfig } from "../history/history.types.ts";
import { KrakenService } from "../kraken/kraken.service.ts";
import logger from "../logger.ts";
import { OkxService } from "../okx/okx.service.ts";
import { OrderBookService } from "../order-book/order-book.service.ts";
import type { WebSocketFactory } from "../provider/provider.service.ts";
import type { CryptoProviderId, CryptoSymbol, FeedEvent, OrderBookSnapshot, PricePoint, ProviderBaseOptions, ProviderContract, TradePoint } from "../provider/provider.types.ts";
import { SymbolService } from "../symbol/symbol.service.ts";
import { ClockService } from "../time/clock.service.ts";
import { NoProvidersConnectedError } from "./client.errors.ts";
import type { ClientOptions, FeedEventListener, HistoryQuery, RetentionOptions, Subscription } from "./client.types.ts";

/**
 * @section consts
 */

const DEFAULT_SYMBOLS: CryptoSymbol[] = [...config.clientDefaults.symbols];
const DEFAULT_PROVIDERS: CryptoProviderId[] = [...config.clientDefaults.providers];
const DEFAULT_RETENTION: RetentionOptions = { ...config.clientDefaults.retention };
const DEFAULT_PROVIDER_OPTIONS: ProviderBaseOptions = { ...config.providerConnection };
const DEFAULT_ORDER_BOOK_LEVELS = config.clientDefaults.orderBookLevels;

/**
 * @section types
 */

type ClientServiceOptions = {
  providers: ProviderContract[];
  historyStoreService: HistoryStoreService;
  historyQueryService: HistoryQueryService;
  clockService: ClockService;
};

type CreateProvidersOptions = {
  clientOptions: ClientOptions | undefined;
  symbolService: SymbolService;
  clockService: ClockService;
};

type ProviderCreationOptions = {
  providerId: CryptoProviderId;
  symbols: CryptoSymbol[];
  clockService: ClockService;
  webSocketFactory: WebSocketFactory;
};

function toRetentionConfig(retentionOverrides?: Partial<RetentionOptions>): HistoryRetentionConfig {
  const retentionConfig: HistoryRetentionConfig = {
    windowMs: retentionOverrides?.windowMs ?? DEFAULT_RETENTION.windowMs,
    maxSamplesPerStream: retentionOverrides?.maxSamplesPerStream ?? DEFAULT_RETENTION.maxSamplesPerStream,
    maxTradesPerStream: retentionOverrides?.maxTradesPerStream ?? DEFAULT_RETENTION.maxTradesPerStream,
  };
  return retentionConfig;
}

function createProvider(options: ProviderCreationOptions): ProviderContract {
  const orderBookService = OrderBookService.create();
  let provider: ProviderContract;

  if (options.providerId === "binance") {
    provider = BinanceService.create({ symbols: options.symbols, clockService: options.clockService, webSocketFactory: options.webSocketFactory, providerOptions: DEFAULT_PROVIDER_OPTIONS });
  } else {
    if (options.providerId === "coinbase") {
      provider = CoinbaseService.create({
        symbols: options.symbols,
        maxLevels: DEFAULT_ORDER_BOOK_LEVELS,
        clockService: options.clockService,
        webSocketFactory: options.webSocketFactory,
        providerOptions: DEFAULT_PROVIDER_OPTIONS,
        orderBookService,
      });
    } else {
      if (options.providerId === "kraken") {
        provider = KrakenService.create({
          symbols: options.symbols,
          maxLevels: DEFAULT_ORDER_BOOK_LEVELS,
          clockService: options.clockService,
          webSocketFactory: options.webSocketFactory,
          providerOptions: DEFAULT_PROVIDER_OPTIONS,
          orderBookService,
        });
      } else {
        if (options.providerId === "okx") {
          provider = OkxService.create({
            symbols: options.symbols,
            maxLevels: DEFAULT_ORDER_BOOK_LEVELS,
            clockService: options.clockService,
            webSocketFactory: options.webSocketFactory,
            providerOptions: DEFAULT_PROVIDER_OPTIONS,
          });
        } else {
          provider = ChainlinkService.create({ symbols: options.symbols, clockService: options.clockService, webSocketFactory: options.webSocketFactory, providerOptions: DEFAULT_PROVIDER_OPTIONS });
        }
      }
    }
  }

  return provider;
}

function createProviders(options: CreateProvidersOptions): ProviderContract[] {
  const rawSymbols = options.clientOptions?.symbols ?? DEFAULT_SYMBOLS;
  const normalizedSymbols = options.symbolService.normalizeSymbols(rawSymbols);
  const providerIds = options.clientOptions?.providers ?? DEFAULT_PROVIDERS;
  const providers: ProviderContract[] = [];
  const webSocketFactory: WebSocketFactory = (connectionUrl) => new WebSocket(connectionUrl);

  for (const providerId of providerIds) {
    const provider = createProvider({ providerId, symbols: normalizedSymbols, clockService: options.clockService, webSocketFactory });
    providers.push(provider);
  }

  return providers;
}

export class CryptoFeedClient {
  /**
   * @section private:attributes
   */

  private readonly providers: ProviderContract[];
  private readonly historyStoreService: HistoryStoreService;
  private readonly historyQueryService: HistoryQueryService;
  private readonly clockService: ClockService;

  /**
   * @section private:properties
   */

  private readonly listeners: Set<FeedEventListener>;

  /**
   * @section constructor
   */

  public constructor(options: ClientServiceOptions) {
    this.providers = options.providers;
    this.historyStoreService = options.historyStoreService;
    this.historyQueryService = options.historyQueryService;
    this.clockService = options.clockService;
    this.listeners = new Set<FeedEventListener>();
  }

  /**
   * @section factory
   */

  public static create(clientOptions?: ClientOptions): CryptoFeedClient {
    const symbolService = SymbolService.create();
    const clockService = ClockService.createSystemClock();
    const retentionConfig = toRetentionConfig(clientOptions?.retention);
    const historyStoreService = HistoryStoreService.create(retentionConfig);
    const historyQueryService = HistoryQueryService.create(historyStoreService, symbolService);
    const providers = createProviders({ clientOptions, symbolService, clockService });
    const client = new CryptoFeedClient({ providers, historyStoreService, historyQueryService, clockService });
    return client;
  }

  /**
   * @section private:methods
   */

  private notifyListeners(event: FeedEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private handleProviderEvent(event: FeedEvent): void {
    const isHistoryEvent = event.type !== "status";

    if (isHistoryEvent) {
      this.historyStoreService.append(event, this.clockService.now());
    }

    this.notifyListeners(event);
  }

  /**
   * @section public:methods
   */

  public async connect(): Promise<void> {
    logger.debug("connect requested");
    const connectTasks: Promise<void>[] = [];

    for (const provider of this.providers) {
      connectTasks.push(provider.connect(this.handleProviderEvent.bind(this)));
    }

    const settledResults = await Promise.allSettled(connectTasks);
    const failedProviders: string[] = [];
    let connectedProviderCount = 0;

    for (let index = 0; index < settledResults.length; index += 1) {
      const settledResult = settledResults[index];
      const provider = this.providers[index];

      if (settledResult?.status === "fulfilled") {
        connectedProviderCount += 1;
      } else {
        failedProviders.push(provider?.id ?? "unknown-provider");
      }
    }

    if (connectedProviderCount === 0) {
      logger.error(`connect failed: no providers connected (${failedProviders.join(", ")})`);
      throw NoProvidersConnectedError.fromProviders(failedProviders);
    }

    if (failedProviders.length > 0) {
      logger.warn(`partial connect success: failed providers (${failedProviders.join(", ")})`);
    } else {
      logger.debug("connect completed: all providers connected");
    }
  }

  public async disconnect(): Promise<void> {
    logger.debug("disconnect requested");
    const disconnectTasks: Promise<void>[] = [];

    for (const provider of this.providers) {
      disconnectTasks.push(provider.disconnect());
    }

    await Promise.allSettled(disconnectTasks);
    this.listeners.clear();
    logger.debug("disconnect completed");
  }

  public subscribe(listener: FeedEventListener): Subscription {
    this.listeners.add(listener);
    const subscription: Subscription = {
      unsubscribe: (): void => {
        this.listeners.delete(listener);
      },
    };
    return subscription;
  }

  public getLatestPrice(symbol: CryptoSymbol, provider?: CryptoProviderId): PricePoint | null {
    const latestPoint = this.historyQueryService.getLatestPrice(symbol, provider);
    return latestPoint;
  }

  public getLatestOrderBook(symbol: CryptoSymbol, provider?: CryptoProviderId): OrderBookSnapshot | null {
    const latestPoint = this.historyQueryService.getLatestOrderBook(symbol, provider);
    return latestPoint;
  }

  public getLatestTrade(symbol: CryptoSymbol, provider?: CryptoProviderId): TradePoint | null {
    const latestPoint = this.historyQueryService.getLatestTrade(symbol, provider);
    return latestPoint;
  }

  public getPriceClosestTo(symbol: CryptoSymbol, targetTs: number, provider?: CryptoProviderId): PricePoint | null {
    const closestPoint = this.historyQueryService.getPriceClosestTo(symbol, targetTs, provider);
    return closestPoint;
  }

  public getPriceHistory(query: HistoryQuery): PricePoint[] {
    const priceHistory = this.historyQueryService.getPriceHistory(query);
    return priceHistory;
  }

  public getOrderBookHistory(query: HistoryQuery): OrderBookSnapshot[] {
    const orderBookHistory = this.historyQueryService.getOrderBookHistory(query);
    return orderBookHistory;
  }

  public getTradeHistory(query: HistoryQuery): TradePoint[] {
    const tradeHistory = this.historyQueryService.getTradeHistory(query);
    return tradeHistory;
  }

  /**
   * @section static:methods
   */

  public static fromProviders(providers: ProviderContract[], retentionOverrides?: Partial<RetentionOptions>): CryptoFeedClient {
    const symbolService = SymbolService.create();
    const clockService = ClockService.createSystemClock();
    const retentionConfig = toRetentionConfig(retentionOverrides);
    const historyStoreService = HistoryStoreService.create(retentionConfig);
    const historyQueryService = HistoryQueryService.create(historyStoreService, symbolService);
    const client = new CryptoFeedClient({ providers, historyStoreService, historyQueryService, clockService });
    return client;
  }
}
