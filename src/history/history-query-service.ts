/**
 * @section imports:externals
 */

// empty

/**
 * @section imports:internals
 */

import type { HistoryQuery } from "../client/client-types.js";
import type {
  CryptoProviderId,
  CryptoSymbol,
  OrderBookSnapshot,
  PricePoint,
  TradePoint
} from "../providers/shared/provider-types.js";
import type { SymbolNormalizer } from "../shared/symbol-normalizer.js";
import { InvalidHistoryQueryError } from "./invalid-history-query-error.js";
import type { InMemoryHistoryStore } from "./in-memory-history-store.js";

/**
 * @section consts
 */

// empty

/**
 * @section types
 */

// empty

export class HistoryQueryService {
  /**
   * @section private:attributes
   */

  private readonly store: InMemoryHistoryStore;

  /**
   * @section protected:attributes
   */

  // empty

  /**
   * @section private:properties
   */

  private readonly symbolNormalizer: SymbolNormalizer;

  /**
   * @section public:properties
   */

  // empty

  /**
   * @section constructor
   */

  public constructor(store: InMemoryHistoryStore, symbolNormalizer: SymbolNormalizer) {
    this.store = store;
    this.symbolNormalizer = symbolNormalizer;
  }

  /**
   * @section static:properties
   */

  // empty

  /**
   * @section factory
   */

  public static create(
    store: InMemoryHistoryStore,
    symbolNormalizer: SymbolNormalizer
  ): HistoryQueryService {
    const service = new HistoryQueryService(store, symbolNormalizer);
    return service;
  }

  /**
   * @section private:methods
   */

  private validateRange(fromTs: number, toTs: number): void {
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
      throw InvalidHistoryQueryError.forReason("fromTs and toTs must be finite numbers");
    }

    if (fromTs > toTs) {
      throw InvalidHistoryQueryError.forReason("fromTs must be less than or equal to toTs");
    }
  }

  private normalizeSymbol(symbol: CryptoSymbol): CryptoSymbol {
    const normalizedSymbol = this.symbolNormalizer.normalizeSymbol(symbol);

    if (!normalizedSymbol) {
      throw InvalidHistoryQueryError.forReason("symbol is required");
    }

    return normalizedSymbol;
  }

  private normalizeProvider(provider?: CryptoProviderId): CryptoProviderId | undefined {
    let normalizedProvider = provider;

    if (provider) {
      normalizedProvider = provider;
    }

    return normalizedProvider;
  }

  /**
   * @section protected:methods
   */

  // empty

  /**
   * @section public:methods
   */

  public getLatestPrice(symbol: CryptoSymbol, provider?: CryptoProviderId): PricePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const normalizedProvider = this.normalizeProvider(provider);
    const point = this.store.getLatest(
      "price",
      normalizedSymbol,
      normalizedProvider
    ) as PricePoint | null;
    return point;
  }

  public getLatestOrderBook(
    symbol: CryptoSymbol,
    provider?: CryptoProviderId
  ): OrderBookSnapshot | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const normalizedProvider = this.normalizeProvider(provider);
    const point = this.store.getLatest(
      "orderbook",
      normalizedSymbol,
      normalizedProvider
    ) as OrderBookSnapshot | null;
    return point;
  }

  public getLatestTrade(symbol: CryptoSymbol, provider?: CryptoProviderId): TradePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const normalizedProvider = this.normalizeProvider(provider);
    const point = this.store.getLatest(
      "trade",
      normalizedSymbol,
      normalizedProvider
    ) as TradePoint | null;
    return point;
  }

  public getPriceHistory(query: HistoryQuery): PricePoint[] {
    const symbol = this.normalizeSymbol(query.symbol);
    this.validateRange(query.fromTs, query.toTs);
    const provider = this.normalizeProvider(query.provider);
    const rangeQuery =
      provider === undefined
        ? { eventType: "price" as const, symbol, fromTs: query.fromTs, toTs: query.toTs }
        : { eventType: "price" as const, symbol, fromTs: query.fromTs, toTs: query.toTs, provider };
    const points = this.store.getRange(rangeQuery);
    const pricePoints = points as PricePoint[];
    return pricePoints;
  }

  public getOrderBookHistory(query: HistoryQuery): OrderBookSnapshot[] {
    const symbol = this.normalizeSymbol(query.symbol);
    this.validateRange(query.fromTs, query.toTs);
    const provider = this.normalizeProvider(query.provider);
    const rangeQuery =
      provider === undefined
        ? { eventType: "orderbook" as const, symbol, fromTs: query.fromTs, toTs: query.toTs }
        : {
            eventType: "orderbook" as const,
            symbol,
            fromTs: query.fromTs,
            toTs: query.toTs,
            provider
          };
    const points = this.store.getRange(rangeQuery);
    const orderBooks = points as OrderBookSnapshot[];
    return orderBooks;
  }

  public getTradeHistory(query: HistoryQuery): TradePoint[] {
    const symbol = this.normalizeSymbol(query.symbol);
    this.validateRange(query.fromTs, query.toTs);
    const provider = this.normalizeProvider(query.provider);
    const rangeQuery =
      provider === undefined
        ? { eventType: "trade" as const, symbol, fromTs: query.fromTs, toTs: query.toTs }
        : { eventType: "trade" as const, symbol, fromTs: query.fromTs, toTs: query.toTs, provider };
    const points = this.store.getRange(rangeQuery);
    const trades = points as TradePoint[];
    return trades;
  }

  public getPriceClosestTo(
    symbol: CryptoSymbol,
    targetTs: number,
    provider?: CryptoProviderId
  ): PricePoint | null {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    if (!Number.isFinite(targetTs)) {
      throw InvalidHistoryQueryError.forReason("targetTs must be a finite number");
    }

    const normalizedProvider = this.normalizeProvider(provider);
    const closest = this.store.getClosestPrice(normalizedSymbol, targetTs, normalizedProvider);
    return closest;
  }

  /**
   * @section static:methods
   */

  // empty
}
